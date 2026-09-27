import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = mkdtempSync(path.join(tmpdir(), "gildam-ai-tests-"));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync(
  process.execPath,
  [
    path.join(root, "node_modules/typescript/bin/tsc"),
    "server/ai-assistant.ts",
    "app/domain/ai-actions.ts",
    "app/domain/naver-place-url.ts",
    "--outDir",
    output,
    "--module",
    "commonjs",
    "--moduleResolution",
    "node",
    "--target",
    "ES2022",
    "--esModuleInterop",
    "--skipLibCheck",
    "--strict",
  ],
  { cwd: root, stdio: "pipe" },
);
const require = createRequire(import.meta.url);
const { insertAiRecommendation } = require(path.join(output, "app/domain/ai-actions.js"));
const { handleAiChat } = require(path.join(output, "server/ai-assistant.js"));
const { naverPlaceUrl, naverPlaceAppUrl, naverMobilePlatform } = require(
  path.join(output, "app/domain/naver-place-url.js"),
);
const { distanceToRoute, sampleRoutePoints, isHighwayRestStop } = require(path.join(output, "server/ai-assistant.js"));
const { createScheduleTools, scheduleTools } = require(path.join(output, "server/schedule-tools.js"));

const place = {
  id: "restaurant-1",
  name: "검색된 식당",
  category: "음식점",
  address: "부산",
  longitude: 129.1,
  latitude: 35.1,
};
const endpoint = { name: "부산", longitude: 129.08, latitude: 35.17 };
const trip = {
  id: "test-trip",
  title: "부산 여행",
  updatedAt: 1,
  days: [1, 2, 3].map((n) => ({
    id: `day-${n}`,
    label: `${n}일차`,
    date: "날짜 미정",
    start: endpoint,
    goal: endpoint,
    places: [],
  })),
};
const recommendation = { place, reason: "동선 주변", dayId: "day-3", insertIndex: 0 };

test("highway rest stop filtering excludes shops inside rest stops", () => {
  assert.equal(isHighwayRestStop({ ...place, category: "교통,수송 > 휴게소 > 고속도로휴게소" }), true);
  assert.equal(isHighwayRestStop({ ...place, name: "섬진강휴게소 카페", category: "음식점 > 카페" }), false);
  assert.equal(
    isHighwayRestStop({ ...place, name: "휴게소 전기차충전소", category: "교통,수송 > 자동차 > 전기차 충전소" }),
    false,
  );
});

test("AI recommendation inserts only into the selected day and carries trip category", () => {
  const result = insertAiRecommendation(trip, recommendation);
  assert.equal(result.error, null);
  assert.equal(result.trip.days[0].places.length, 0);
  assert.equal(result.trip.days[2].places[0].id, place.id);
  assert.ok(result.trip.days[2].places[0].savedCategories.includes(trip.title));
  assert.equal(trip.days[2].places.length, 0);
});

test("AI insertion preserves existing order and rejects duplicates, missing dates and invalid coordinates", () => {
  const inserted = insertAiRecommendation(trip, recommendation).trip;
  assert.ok(insertAiRecommendation(inserted, recommendation).error);
  assert.ok(insertAiRecommendation(trip, { ...recommendation, dayId: "missing" }).error);
  assert.ok(insertAiRecommendation(trip, { ...recommendation, insertIndex: 3 }).error);
  assert.ok(insertAiRecommendation(trip, { ...recommendation, place: { ...place, latitude: NaN } }).error);
  const second = { ...place, id: "second", name: "두 번째", longitude: 129.2 };
  const result = insertAiRecommendation(inserted, { ...recommendation, place: second, insertIndex: 0 });
  assert.deepEqual(
    result.trip.days[2].places.map((item) => item.id),
    ["second", place.id],
  );
});

test("AI insertion respects the 30-stop daily limit", () => {
  const full = {
    ...trip,
    days: trip.days.map((day) => ({
      ...day,
      places: Array.from({ length: 30 }, (_, n) => ({ ...place, id: `p-${n}` })),
    })),
  };
  assert.match(insertAiRecommendation(full, recommendation).error, /30/);
});

test("missing OpenAI key returns a safe error without upstream calls", async () => {
  let called = false;
  const dep = async () => {
    called = true;
    throw new Error("should not run");
  };
  const response = await handleAiChat(
    new Request("https://gildam.test/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ trip, activeDayId: "day-1", message: "셋째날 식당 추천해줘", history: [] }),
    }),
    {},
    { search: dep, route: dep },
  );
  assert.equal(response.status, 503);
  assert.equal(called, false);
  assert.doesNotMatch(await response.text(), /OPENAI_API_KEY|sk-/);
});

function request(overrides = {}) {
  return new Request("https://gildam.test/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ trip, activeDayId: "day-1", message: "셋째날 식당 추천해줘", history: [], ...overrides }),
  });
}

test("Naver links retain verified IDs and avoid overly specific address searches", () => {
  const p = {
    ...place,
    name: "연화리해물천국 해운대 엘시티점",
    address: "부산광역시 해운대구 달맞이길 30 엘씨티 포디움동 1040호",
  };
  assert.equal(
    decodeURIComponent(naverPlaceUrl(p)),
    "https://map.naver.com/p/search/부산광역시 해운대구 연화리해물천국 해운대 엘시티점",
  );
  assert.equal(
    naverPlaceUrl({ ...p, link: "https://m.place.naver.com/restaurant/12345/home" }),
    "https://map.naver.com/p/entry/place/12345",
  );
  assert.equal(
    naverPlaceUrl({ ...p, link: "https://map.naver.com/p/search/test/place/12345" }),
    "https://map.naver.com/p/entry/place/12345",
  );
  assert.equal(naverPlaceUrl({ ...p, link: "https://place.map.kakao.com/12345" }), naverPlaceUrl(p));
  assert.equal(naverPlaceUrl({ ...p, link: "https://map.naver.com.evil.test/p/entry/place/12345" }), naverPlaceUrl(p));
});

test("mobile Naver links use direct app schemes and retain a safe Android web fallback", () => {
  assert.equal(naverMobilePlatform("Mozilla iPhone"), "ios");
  assert.equal(naverMobilePlatform("Mozilla Android"), "android");
  assert.equal(naverMobilePlatform("Mozilla Macintosh", 5), "ios");
  assert.equal(naverMobilePlatform("Mozilla Macintosh", 0), null);
  assert.equal(naverMobilePlatform("Mozilla Windows", 10), null);
  const p = { ...place, name: "식당 & 카페 #1" };
  const ios = new URL(naverPlaceAppUrl(p, "ios", "https://example.com/"));
  assert.equal(ios.protocol, "nmap:");
  assert.equal(ios.hostname, "search");
  assert.equal(ios.searchParams.get("query"), "부산 식당 & 카페 #1");
  assert.equal(ios.searchParams.get("appname"), "https://example.com/");
  const android = naverPlaceAppUrl(p, "android", "https://example.com/");
  assert.ok(android.startsWith("intent://search?"));
  assert.ok(android.includes("package=com.nhn.android.nmap;"));
  assert.ok(android.includes(`S.browser_fallback_url=${encodeURIComponent(naverPlaceUrl(p))};end`));
});

for (const fixOnRetry of [false, true]) {
  test(`missing recommendation IDs retry once then retain real cards: ${fixOnRetry}`, async (t) => {
    let calls = 0,
      searches = 0;
    t.mock.method(globalThis, "fetch", async (_url, options) => {
      calls++;
      const body = JSON.parse(options.body);
      if (calls === 1)
        return Response.json({
          status: "completed",
          output: [
            {
              type: "function_call",
              name: "search_near_place",
              call_id: "search",
              arguments: JSON.stringify({ dayId: "day-1", query: "식당", anchorId: "start" }),
            },
          ],
        });
      if (calls === 3) assert.equal(body.tool_choice, "none");
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  message: "식당을 골라봤어요.",
                  recommendationIds:
                    calls === 3 && fixOnRetry ? ["recommendation-1"] : calls === 2 ? [] : ["invalid-place-id"],
                }),
              },
            ],
          },
        ],
      });
    });
    const response = await handleAiChat(
      request(),
      { OPENAI_API_KEY: "test-only" },
      {
        search: async () => {
          searches++;
          return Response.json({ places: [{ ...place, ...endpoint }] });
        },
        route: async () => assert.fail("unexpected route call"),
      },
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls, 3);
    assert.equal(searches, 1);
    assert.equal(body.recommendations.length, 1);
    assert.equal(body.recommendations[0].place.id, place.id);
    assert.match(body.recommendations[0].description, /음식점/);
    assert.match(body.recommendations[0].description, /확인/);
    if (!fixOnRetry) assert.match(body.message, /후보 장소/);
  });
}

function mockSearchTool(t, name, args, inspect) {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const body = JSON.parse(options.body);
    if (calls++ === 0) {
      assert.ok(body.tools.some((tool) => tool.name === "search_near_place"));
      assert.ok(body.tools.some((tool) => tool.name === "search_saved_places"));
      assert.ok(body.tools.some((tool) => tool.name === "search_along_route"));
      return Response.json({
        status: "completed",
        output: [{ type: "function_call", name, call_id: "search", arguments: JSON.stringify(args) }],
      });
    }
    const result = JSON.parse(body.input.at(-1).output);
    inspect(result);
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                message: "검색 결과입니다.",
                recommendationIds: (result.places ?? []).map((p) => p.id),
              }),
            },
          ],
        },
      ],
    });
  });
}

test("nearby meal search uses itinerary coordinates without routes and excludes cafes", async (t) => {
  mockSearchTool(t, "search_near_place", { dayId: "day-1", query: "점심", anchorId: "start" }, (result) => {
    assert.equal(result.status, "ok");
    assert.deepEqual(result.searchBasis, [endpoint.name]);
    assert.equal(result.places.length, 1);
    assert.match(result.places[0].distanceLabel, /직선/);
  });
  const response = await handleAiChat(
    request(),
    { OPENAI_API_KEY: "test-only" },
    {
      search: async (params) => {
        assert.equal(params.get("q"), "식당");
        assert.equal(params.get("fromLng"), String(endpoint.longitude));
        return Response.json({
          places: [
            { ...place, ...endpoint, id: "meal" },
            { ...place, ...endpoint, id: "cafe", category: "음식점 > 카페" },
          ],
        });
      },
      route: async () => assert.fail("nearby search must not calculate routes"),
    },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).recommendations.length, 1);
});

for (const failure of [false, true]) {
  test(`nearby search distinguishes empty results from provider failure: ${failure}`, async (t) => {
    mockSearchTool(t, "search_near_place", { dayId: "day-1", query: "식당", anchorId: null }, (result) => {
      assert.equal(result.status, failure ? "upstream_error" : "empty");
    });
    const response = await handleAiChat(
      request(),
      { OPENAI_API_KEY: "test-only" },
      {
        search: async () => Response.json(failure ? {} : { places: [] }, { status: failure ? 503 : 200 }),
        route: async () => assert.fail("unexpected route call"),
      },
    );
    assert.equal(response.status, 200);
  });
}

test("nearby search rejects fabricated anchor IDs without provider calls", async (t) => {
  mockSearchTool(t, "search_near_place", { dayId: "day-1", query: "식당", anchorId: "fabricated" }, (result) =>
    assert.equal(result.status, "invalid_input"),
  );
  const noCall = async () => assert.fail("must not call provider");
  assert.equal(
    (await handleAiChat(request(), { OPENAI_API_KEY: "test-only" }, { search: noCall, route: noCall })).status,
    200,
  );
});

test("saved search uses only saved snapshot and supports multiple categories without external search", async (t) => {
  mockSearchTool(t, "search_saved_places", { dayId: "day-1", query: "", category: "부산 여행" }, (result) => {
    assert.equal(result.total, 1);
    assert.equal(result.places[0].placeId, "saved");
  });
  const noCall = async () => assert.fail("must not call provider");
  const response = await handleAiChat(
    request({
      savedPlaces: [{ ...place, id: "saved", savedCategories: ["식당", "부산 여행"] }],
      availablePlaces: [{ ...place, id: "recent", savedCategories: ["부산 여행"] }],
    }),
    { OPENAI_API_KEY: "test-only" },
    { search: noCall, route: noCall },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).recommendations[0].place.id, "saved");
});

test("empty route samples fall back to itinerary stops within the six-search budget", async (t) => {
  mockSearchTool(
    t,
    "search_along_route",
    { dayId: "day-1", query: "식당", insertIndex: null, originId: null, destinationId: null },
    (result) => {
      assert.equal(result.status, "ok");
      assert.ok(result.searchBasis.includes(endpoint.name));
    },
  );
  let searches = 0;
  const response = await handleAiChat(
    request(),
    { OPENAI_API_KEY: "test-only" },
    {
      search: async (params) => {
        searches++;
        return Response.json({
          places: Number(params.get("fromLng")) === endpoint.longitude ? [{ ...place, ...endpoint }] : [],
        });
      },
      route: async () =>
        Response.json({
          path: [
            [127, 35],
            [127.5, 35],
            [128, 35],
            [128.5, 35],
          ],
        }),
    },
  );
  assert.equal(response.status, 200);
  assert.ok(searches > 1 && searches <= 6);
  assert.equal((await response.json()).recommendations.length, 1);
});

test("server rejects malformed context and oversized input before any external call", async () => {
  const noCall = async () => {
    assert.fail("must not call a provider");
  };
  const deps = { search: noCall, route: noCall };
  assert.equal(
    (await handleAiChat(request({ activeDayId: "absent" }), { OPENAI_API_KEY: "test-only" }, deps)).status,
    400,
  );
  assert.equal(
    (await handleAiChat(request({ message: "a".repeat(190000) }), { OPENAI_API_KEY: "test-only" }, deps)).status,
    413,
  );
});

test("route corridor helpers use intermediate route points and distinguish off-route places", () => {
  const route = [
    { longitude: 127, latitude: 35 },
    { longitude: 128, latitude: 35 },
    { longitude: 129, latitude: 35 },
  ];
  assert.ok(sampleRoutePoints(route, 4).some((point) => point.longitude === 128));
  const close = distanceToRoute({ longitude: 128, latitude: 35.001 }, route);
  const far = distanceToRoute({ longitude: 128, latitude: 36 }, route);
  assert.ok(close.distance < 200);
  assert.ok(far.distance > 100000);
  assert.ok(close.progress > 0);
});

test("tool calling grounds third-day cards in real search output and drops fabricated IDs", async (t) => {
  let modelCalls = 0,
    searches = 0;
  let routed;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.parallel_tool_calls, false);
    modelCalls++;
    return Response.json({
      status: "completed",
      output:
        modelCalls === 1
          ? [
              {
                type: "function_call",
                name: "search_day_places",
                call_id: "call-1",
                arguments: JSON.stringify({
                  dayId: "day-3",
                  query: "식당",
                  insertIndex: null,
                  originId: null,
                  destinationId: null,
                }),
              },
            ]
          : [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      message: "셋째 날 동선 주변 장소예요.",
                      recommendationIds: ["fake-place", "recommendation-1", "recommendation-1"],
                      placeDetails: [
                        { recommendationId: "fake-place", description: "없는 장소", reason: "잘못된 추천" },
                        {
                          recommendationId: "recommendation-1",
                          description: "부산에 있는 음식점이에요.",
                          reason: "셋째 날 경로 주변에서 찾은 식사 후보예요.",
                        },
                      ],
                    }),
                  },
                ],
              },
            ],
    });
  });
  const response = await handleAiChat(
    request(),
    { OPENAI_API_KEY: "test-only" },
    {
      search: async () => {
        searches++;
        return Response.json({ places: [place] });
      },
      route: async (body) => {
        routed = body;
        return Response.json({
          path: [
            [129.08, 35.17],
            [129.1, 35.1],
          ],
        });
      },
    },
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(routed.scope.dayId, "day-3");
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].dayId, "day-3");
  assert.equal(result.recommendations[0].description, "부산에 있는 음식점이에요.");
  assert.equal(result.recommendations[0].reason, "셋째 날 경로 주변에서 찾은 식사 후보예요.");
  assert.deepEqual(result.recommendations[0].place, place);
  assert.match(result.recommendations[0].distanceLabel, /직선/);
  assert.ok(searches > 0 && searches <= 6);
  assert.equal(modelCalls, 2);
});

test("provider authentication errors do not expose their raw error or secret", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: { message: "invalid secret test-only" } }, { status: 401 }),
  );
  const noCall = async () => {
    assert.fail("must not call search");
  };
  const response = await handleAiChat(request(), { OPENAI_API_KEY: "test-only" }, { search: noCall, route: noCall });
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /test-only|invalid secret/);
});

test("exhausted credits are distinguished from temporary rate limiting", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: { type: "insufficient_quota", code: "credit_balance_exhausted" } }, { status: 429 }),
  );
  const noCall = async () => {
    assert.fail("must not call search");
  };
  const response = await handleAiChat(request(), { OPENAI_API_KEY: "test-only" }, { search: noCall, route: noCall });
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.match(result.error, /일반 장소 검색/);
  assert.doesNotMatch(result.error, /요청이 많|크레딧|API/);
});

test("unset default endpoints never trigger a real map search", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    return Response.json({
      status: "completed",
      output:
        count === 1
          ? [
              {
                type: "function_call",
                name: "search_day_places",
                call_id: "c1",
                arguments: JSON.stringify({
                  dayId: "day-3",
                  query: "식당",
                  insertIndex: null,
                  originId: null,
                  destinationId: null,
                }),
              },
            ]
          : [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({ message: "출발지와 목적지를 먼저 설정해 주세요.", recommendationIds: [] }),
                  },
                ],
              },
            ],
    });
  });
  const noCall = async () => {
    assert.fail("placeholder coordinates must not reach providers");
  };
  const blank = { ...trip, days: trip.days.map((day) => ({ ...day, start: { ...endpoint, name: "출발지 미정" } })) };
  const response = await handleAiChat(
    request({ trip: blank }),
    { OPENAI_API_KEY: "test-only" },
    { search: noCall, route: noCall },
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).recommendations, []);
});

test("internal schedule registry reads actual IDs and never mutates on preparation", () => {
  const original = structuredClone(trip);
  const registry = createScheduleTools([trip], new Map([[place.id, place]]));
  const listed = registry.execute("list_trips", {});
  assert.equal(listed.trips[0].days[2].id, "day-3");
  const day = registry.execute("get_day_schedule", { tripId: trip.id, dayId: "day-3" });
  assert.equal(day.dayNumber, 3);
  assert.equal(registry.actions.length, 0);
  const result = registry.execute("add_schedule_place", {
    tripId: trip.id,
    dayId: "day-3",
    placeId: place.id,
    insertIndex: 0,
  });
  assert.equal(result.status, "awaiting_user_confirmation");
  assert.equal(registry.actions[0].command.place.id, place.id);
  assert.equal(registry.actions[0].command.dayId, "day-3");
  assert.deepEqual(trip, original);
  assert.ok(registry.execute("remove_schedule_place", { tripId: trip.id, dayId: "day-3", placeId: place.id }).error);
  assert.equal(registry.actions.length, 1);
  assert.equal(scheduleTools.find((tool) => tool.name === "remove_schedule_place").annotations.destructiveHint, true);
});

test("forged IDs and invalid insertion positions cannot produce actions", () => {
  const registry = createScheduleTools([trip], new Map([[place.id, place]]));
  for (const args of [
    { placeId: "made-up", insertIndex: 0 },
    { placeId: place.id, insertIndex: 100 },
    { placeId: place.id, insertIndex: "0" },
  ]) {
    assert.ok(registry.execute("add_schedule_place", { tripId: trip.id, dayId: "day-3", ...args }).error);
  }
  assert.equal(registry.actions.length, 0);
});

test("delete preparation explicitly describes promotion of first candidate", () => {
  const candidate = { ...place, id: "backup", name: "후보 식당" };
  const withCandidate = {
    ...trip,
    days: trip.days.map((day) =>
      day.id === "day-3" ? { ...day, places: [place], candidates: { [place.id]: [candidate] } } : day,
    ),
  };
  const registry = createScheduleTools([withCandidate], new Map());
  registry.execute("remove_schedule_place", { tripId: trip.id, dayId: "day-3", placeId: place.id });
  assert.match(registry.actions[0].label, /첫 후보 후보 식당.*메인/);
  assert.equal(registry.actions[0].expectedTripUpdatedAt, trip.updatedAt);
  assert.equal(withCandidate.days[2].places[0].id, place.id);
});

test("model tools prepare prior recommendation addition with a mandatory confirmation message", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const body = JSON.parse(options.body);
    calls++;
    if (calls === 1) {
      const context = JSON.parse(body.input.at(-1).content).context;
      assert.equal(context.availablePlaces[0].id, place.id);
    }
    const tool =
      calls === 1
        ? { name: "get_day_schedule", arguments: { tripId: trip.id, dayId: "day-3" } }
        : {
            name: "add_schedule_place",
            arguments: { tripId: trip.id, dayId: "day-3", placeId: place.id, insertIndex: 0 },
          };
    return Response.json({
      status: "completed",
      output:
        calls <= 2
          ? [
              {
                type: "function_call",
                call_id: `call-${calls}`,
                name: tool.name,
                arguments: JSON.stringify(tool.arguments),
              },
            ]
          : [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({ message: "저장 완료!", recommendationIds: [], actions: [{ id: "forged" }] }),
                  },
                ],
              },
            ],
    });
  });
  const noCall = async () => assert.fail("read/preparation must not call map providers");
  const response = await handleAiChat(
    request({ message: "추천한 식당을 셋째날에 넣어줘", availablePlaces: [place] }),
    { OPENAI_API_KEY: "test-only" },
    { search: noCall, route: noCall },
  );
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].command.kind, "add_place");
  assert.equal(result.actions[0].command.place.id, place.id);
  assert.notEqual(result.actions[0].id, "forged");
  assert.match(result.message, /확인/);
  assert.doesNotMatch(result.message, /저장 완료/);
});

test("additional travel and known place context is bounded and validated", async () => {
  const noCall = async () => assert.fail("invalid context must not reach providers");
  const deps = { search: noCall, route: noCall };
  for (const extra of [
    { trips: [{ ...trip, updatedAt: "wrong" }] },
    { availablePlaces: [{ ...place, latitude: 999 }] },
    { availablePlaces: Array.from({ length: 201 }, () => place) },
    { trip: { ...trip, days: [{ ...trip.days[0], candidates: { missing: [place] } }] } },
  ])
    assert.equal((await handleAiChat(request(extra), { OPENAI_API_KEY: "test-only" }, deps)).status, 400);
});
