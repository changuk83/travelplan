import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import ts from "typescript";

const output = mkdtempSync(path.join(tmpdir(), "gildam-schedule-tests-"));
after(() => rmSync(output, { recursive: true, force: true }));
for (const file of [
  "app/domain/place",
  "app/domain/schedule-service",
  "api-worker/src/state-store",
  "api-worker/src/schedule-api",
]) {
  const destination = path.join(output, `${file}.js`);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(
    destination,
    ts.transpileModule(readFileSync(new URL(`../${file}.ts`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  );
}
const require = createRequire(import.meta.url);
const { applyScheduleCommand } = require(path.join(output, "app/domain/schedule-service.js"));
const { handleScheduleApi } = require(path.join(output, "api-worker/src/schedule-api.js"));
const { readState, writeState } = require(path.join(output, "api-worker/src/state-store.js"));

const place = (id) => ({
  id,
  name: id,
  category: "식당",
  address: "부산",
  longitude: 129,
  latitude: 35,
  memo: "추천 메뉴",
});
const endpoint = { name: "부산", longitude: 129, latitude: 35 };
const state = () => ({
  trips: [
    {
      id: "t",
      title: "부산 여행",
      updatedAt: 1,
      days: [1, 2].map((n) => ({
        id: `d${n}`,
        label: `${n}일차`,
        date: "날짜 미정",
        start: endpoint,
        goal: endpoint,
        places: n === 1 ? [place("main"), place("second")] : [],
        candidates: n === 1 ? { main: [place("candidate"), place("candidate2")] } : {},
      })),
    },
  ],
  savedPlaces: [],
  savedCategories: [],
});
const command = (kind, extra = {}) => ({ kind, tripId: "t", dayId: "d1", ...extra });

test("shared add saves travel category and preserves existing memo/categories", () => {
  const original = state();
  original.savedPlaces = [{ ...place("new"), memo: "기존 메모", savedCategories: ["맛집"] }];
  const result = applyScheduleCommand(original, command("add_place", { place: place("new"), insertIndex: 1 }), 1);
  assert.equal(result.error, null);
  assert.deepEqual(
    result.state.trips[0].days[0].places.map((p) => p.id),
    ["main", "new", "second"],
  );
  assert.deepEqual(result.state.savedPlaces[0].savedCategories, ["맛집", "부산 여행"]);
  assert.equal(result.state.savedPlaces[0].memo, "기존 메모");
  assert.equal(original.trips[0].days[0].places.length, 2);
});
test("remove promotes first candidate, retains others and keeps saved places", () => {
  const original = state();
  original.savedPlaces = [place("main")];
  const result = applyScheduleCommand(original, command("remove_place", { placeId: "main" }), 1);
  assert.equal(result.error, null);
  const day = result.state.trips[0].days[0];
  assert.equal(day.places[0].id, "candidate");
  assert.equal(day.places[0].memo, "추천 메뉴");
  assert.deepEqual(
    day.candidates.candidate.map((p) => p.id),
    ["candidate2"],
  );
  assert.equal(day.candidates.main, undefined);
  assert.equal(result.state.savedPlaces[0].id, "main");
});
test("move within a day and across days preserves candidate association", () => {
  let result = applyScheduleCommand(state(), command("move_place", { placeId: "main", toDayId: "d1", insertIndex: 1 }));
  assert.deepEqual(
    result.state.trips[0].days[0].places.map((p) => p.id),
    ["second", "main"],
  );
  result = applyScheduleCommand(
    result.state,
    command("move_place", { placeId: "main", toDayId: "d2", insertIndex: 0 }),
  );
  assert.equal(result.error, null);
  assert.equal(result.state.trips[0].days[1].candidates.main.length, 2);
  assert.equal(result.state.trips[0].days[0].candidates.main, undefined);
});
test("candidate registration saves to my places with trip category", () => {
  const result = applyScheduleCommand(state(), command("add_candidate", { placeId: "main", candidate: place("new") }));
  assert.equal(result.error, null);
  assert.equal(result.state.trips[0].days[0].candidates.main.length, 3);
  assert.ok(result.state.savedPlaces[0].savedCategories.includes("부산 여행"));
});
test("stale version, duplicates, invalid coordinates, indices, absent targets and 30-limit reject immutably", () => {
  const original = state();
  for (const [cmd, version] of [
    [command("remove_place", { placeId: "main" }), 0],
    [command("add_place", { place: place("main"), insertIndex: 0 })],
    [command("add_place", { place: { ...place("new"), longitude: NaN }, insertIndex: 0 })],
    [command("add_place", { place: place("new"), insertIndex: -1 })],
    [command("move_place", { placeId: "main", toDayId: "missing", insertIndex: 0 })],
    [command("add_candidate", { placeId: "main", candidate: place("candidate") })],
    [command("unsupported")],
  ]) {
    const result = applyScheduleCommand(original, cmd, version);
    assert.ok(result.error);
    assert.equal(result.state, original);
  }
  original.trips[0].days[0].places = Array.from({ length: 30 }, (_, n) => place(`p${n}`));
  assert.match(
    applyScheduleCommand(original, command("add_place", { place: place("new"), insertIndex: 0 })).error,
    /30/,
  );
});

test("special place IDs never read or write inherited candidate properties", () => {
  const original = state();
  original.trips[0].days[0].places = [place("__proto__")];
  original.trips[0].days[0].candidates = {};
  const added = applyScheduleCommand(
    original,
    command("add_candidate", { placeId: "__proto__", candidate: place("constructor") }),
  );
  assert.equal(added.error, null);
  assert.equal(added.state.trips[0].days[0].candidates.__proto__.length, 1);
  const removed = applyScheduleCommand(added.state, command("remove_place", { placeId: "__proto__" }));
  assert.equal(removed.error, null);
  assert.equal(removed.state.trips[0].days[0].places[0].id, "constructor");
  assert.equal(Object.getPrototypeOf(removed.state.trips[0].days[0].candidates), Object.prototype);
});

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  const dir = new URL("../api-worker/migrations/", import.meta.url);
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(new URL(name, dir), "utf8"));
  const prepare = (sql, params = []) => ({
    bind: (...values) => prepare(sql, values),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    execute() {
      const stmt = sqlite.prepare(sql);
      if (/^SELECT\b/i.test(sql)) return { results: stmt.all(...params), success: true };
      const result = stmt.run(...params);
      return { results: [], success: true, meta: { changes: Number(result.changes) } };
    },
  });
  return {
    prepare,
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((s) => s.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
const post = (body) =>
  new Request("http://localhost/api/schedule/commands", { method: "POST", body: JSON.stringify(body) });
test("HTTP command confirms once, replays exact result after later edit, rejects changed requestId payload", async () => {
  const db = database();
  await writeState(db, "1", "device", state(), 0, "seed");
  const body = {
    requestId: "apply",
    expectedRevision: 1,
    expectedTripUpdatedAt: 1,
    command: command("add_place", { place: place("new"), insertIndex: 0 }),
  };
  const response = await handleScheduleApi(post(body), db, "1", "device");
  assert.equal(response.status, 200);
  const applied = await response.json();
  assert.equal(applied.revision, 2);
  const later = structuredClone(applied);
  later.trips[0].title = "다른 수정";
  await writeState(db, "1", "device", later, 2, "later");
  assert.deepEqual(await (await handleScheduleApi(post(body), db, "1", "device")).json(), applied);
  assert.equal((await readState(db, "1")).revision, 3);
  assert.equal(
    (
      await handleScheduleApi(
        post({ ...body, command: command("remove_place", { placeId: "main" }) }),
        db,
        "1",
        "device",
      )
    ).status,
    409,
  );
});
test("HTTP rejects stale/invalid requests and legacy unversioned snapshot without touching data", async () => {
  const db = database();
  await writeState(db, "1", "device", state(), 0, "seed");
  assert.equal((await handleScheduleApi(post({}), db, "1", "device")).status, 400);
  const stale = {
    requestId: "stale",
    expectedRevision: 0,
    expectedTripUpdatedAt: 1,
    command: command("remove_place", { placeId: "main" }),
  };
  assert.equal((await handleScheduleApi(post(stale), db, "1", "device")).status, 409);
  const unversioned = new Request("http://localhost/api/state", { method: "PUT", body: JSON.stringify(state()) });
  assert.equal((await handleScheduleApi(unversioned, db, "1", "device")).status, 428);
  assert.equal((await readState(db, "1")).revision, 1);
});
