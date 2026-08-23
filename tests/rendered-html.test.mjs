import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Gildam trip planner shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="ko">/i);
  assert.match(html, /<title>길담 \| 자동차와 도보를 잇는 여행<\/title>/i);
  assert.match(html, /class="app-shell"/);
  assert.match(html, /class="trip-hero"/);
  assert.match(html, /aria-label="여행 날짜"/);
  assert.match(html, /aria-label="주요 메뉴"/);
  assert.match(html, />일정<\/button>/);
  assert.match(html, />여행<\/button>/);
  assert.match(html, />내 장소<\/button>/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps UI, domain state, and cloud sync split into dedicated modules", async () => {
  const [page, tripsHook, cloudHook, mapTypes] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useTrips.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useCloudSync.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/map-sdk-types.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /from "\.\/components\/schedule\/ScheduleTimeline"/);
  assert.match(page, /from "\.\/components\/search\/PlaceSearchPage"/);
  assert.match(page, /from "\.\/components\/saved-places\/SavedPlacesPage"/);
  assert.match(page, /from "\.\/hooks\/useTrips"/);
  assert.match(page, /from "\.\/hooks\/useCloudSync"/);
  assert.match(tripsHook, /const days = trips\.find/);
  assert.match(tripsHook, /const setDays: Dispatch<SetStateAction<DayPlan\[\]>>/);
  assert.match(cloudHook, /fetch\(`\$\{apiBase\}\/api\/state`/);
  assert.match(mapTypes, /type GoogleMapsApi/);
  assert.match(mapTypes, /type NaverMapsApi/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview/);
});
