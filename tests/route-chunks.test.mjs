import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, require = () => helpers) {
  const exports = {};
  new Function(
    "exports",
    "require",
    ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  )(exports, require);
  return exports;
}
const helpers = load("../server/route-chunks.ts");
const { splitDrivingRoute, sameRoutePoint } = helpers;
const { POST } = load("../app/api/routes/route.ts");
const a = { longitude: 129.1697794, latitude: 35.1599414 };
const b = { longitude: 129.2231430744025, latitude: 35.18840281721384 };
const c = { longitude: 129.1697847, latitude: 35.1599268 };

test("round trips and closed chunks preserve each segment without identical endpoints", () => {
  for (const points of [[a, b, a], [a, b, c], Array.from({ length: 32 }, (_, i) => (i % 2 ? a : b))]) {
    const chunks = splitDrivingRoute(points);
    assert.deepEqual(
      chunks.flatMap((chunk, i) => (i ? chunk.slice(1) : chunk)),
      points,
    );
    assert.ok(chunks.every((chunk) => chunk.length <= 7 && !sameRoutePoint(chunk[0], chunk.at(-1))));
  }
  assert.deepEqual(splitDrivingRoute([a]), []);
  assert.equal(sameRoutePoint(a, c), true);
  assert.equal(sameRoutePoint(a, { ...a, latitude: a.latitude + 0.0001 }), false);
});

test("local route handler joins day two halves, restores zero leg, rejects empty provider results", async () => {
  const oldFetch = globalThis.fetch;
  const oldId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const oldSecret = process.env.NAVER_MAP_CLIENT_SECRET;
  process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID = "test";
  process.env.NAVER_MAP_CLIENT_SECRET = "test";
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const start = url.searchParams.get("start").split(",").map(Number);
    const goal = url.searchParams.get("goal").split(",").map(Number);
    assert.notDeepEqual(start, goal);
    return Response.json({
      route: {
        traoptimal: [
          {
            path: [start, goal],
            summary: { distance: 10, duration: 20 },
            guide: [{ type: 88, distance: 10, duration: 20 }],
          },
        ],
      },
    });
  };
  const request = () =>
    new Request("http://localhost/api/routes", {
      method: "POST",
      body: JSON.stringify({ start: a, goal: a, waypoints: [b, c] }),
    });
  try {
    const response = await POST(request());
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls.length, 2);
    assert.equal(data.path.length, 3);
    assert.deepEqual(data.legs, [
      { distance: 10, duration: 20 },
      { distance: 10, duration: 20 },
      { distance: 0, duration: 0 },
    ]);
    assert.deepEqual(data.summary, { distance: 20, duration: 40 });
    globalThis.fetch = async () => Response.json({ code: 1 });
    assert.equal((await POST(request())).status, 502);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldId === undefined) delete process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
    else process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID = oldId;
    if (oldSecret === undefined) delete process.env.NAVER_MAP_CLIENT_SECRET;
    else process.env.NAVER_MAP_CLIENT_SECRET = oldSecret;
  }
});
