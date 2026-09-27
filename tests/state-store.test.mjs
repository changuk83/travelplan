import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = mkdtempSync(path.join(tmpdir(), "gildam-store-tests-"));
after(() => rmSync(output, { recursive: true, force: true }));
writeFileSync(
  path.join(output, "state-store.cjs"),
  ts.transpileModule(readFileSync(path.join(root, "api-worker/src/state-store.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
);
const require = createRequire(import.meta.url);
const { readState, writeState } = require(path.join(output, "state-store.cjs"));

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  const dir = path.join(root, "api-worker/migrations");
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(path.join(dir, name), "utf8"));
  const prepare = (sql, params = []) => ({
    bind: (...values) => prepare(sql, values),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    execute() {
      const statement = sqlite.prepare(sql);
      if (/^SELECT\b/i.test(sql)) return { results: statement.all(...params), success: true };
      const result = statement.run(...params);
      return { results: [], success: true, meta: { changes: Number(result.changes) } };
    },
  });
  return {
    sqlite,
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
const endpoint = { name: "부산", longitude: 129, latitude: 35 };
const place = { ...endpoint, id: "p1", category: "식당", address: "부산 주소", memo: "메뉴 기록" };
const sample = () => ({
  trips: [
    {
      id: "t1",
      title: "부산여행",
      updatedAt: 123,
      days: [
        {
          id: "d1",
          label: "1일차",
          date: "9월 27일",
          dateValue: "2026-09-27",
          start: endpoint,
          goal: endpoint,
          places: [place],
          candidates: { p1: [{ ...place, id: "candidate", memo: "후보 메모" }] },
        },
      ],
    },
  ],
  savedPlaces: [{ ...place, savedCategories: ["부산여행", "식당"] }],
  savedCategories: ["부산여행", "식당"],
});

test("legacy users begin at revision 0 and relational roundtrip preserves data", async () => {
  const db = database();
  assert.equal((await readState(db, "1")).revision, 0);
  await writeState(db, "1", "device1", sample(), 0, "first");
  assert.deepEqual(await readState(db, "1"), { ...sample(), revision: 1 });
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM state_write_guards").get().n, 0);
});
test("two concurrent same revision writers: exactly one commit, stale write rolls back", async () => {
  const db = database();
  const a = sample(),
    b = sample();
  b.trips[0].title = "changed";
  const results = await Promise.allSettled([
    writeState(db, "1", "device1", a, 0, "a"),
    writeState(db, "1", "device1", b, 0, "b"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.code, "REVISION_CONFLICT");
  assert.deepEqual(await readState(db, "1"), results.find((r) => r.status === "fulfilled").value);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM state_write_requests").get().n, 1);
});
test("lost-response replay returns original committed snapshot even after later writes", async () => {
  const db = database();
  const state = sample();
  const original = await writeState(db, "1", "device1", state, 0, "a");
  await writeState(db, "1", "device1", { trips: [], savedPlaces: [], savedCategories: [] }, 1, "b");
  assert.deepEqual(await writeState(db, "1", "device1", state, 0, "a"), original);
  assert.equal((await readState(db, "1")).revision, 2);
  const changed = sample();
  changed.trips[0].title = "different";
  await assert.rejects(writeState(db, "1", "device1", changed, 0, "a"), { code: "REQUEST_ID_REUSED" });
});
test("concurrent identical requests both return the same single commit", async () => {
  const db = database();
  const [a, b] = await Promise.all([
    writeState(db, "1", "device1", sample(), 0, "a"),
    writeState(db, "1", "device1", sample(), 0, "a"),
  ]);
  assert.deepEqual(a, b);
  assert.equal((await readState(db, "1")).revision, 1);
});
test("global ID collisions and device reassignment cannot overwrite another user", async () => {
  const db = database();
  await writeState(db, "1", "device1", sample(), 0, "a");
  await assert.rejects(writeState(db, "2", "device2", sample(), 0, "b"), { code: "OWNERSHIP_CONFLICT" });
  await assert.rejects(writeState(db, "2", "device1", { trips: [], savedPlaces: [], savedCategories: [] }, 0, "c"), {
    code: "OWNERSHIP_CONFLICT",
  });
  assert.deepEqual(await readState(db, "1"), { ...sample(), revision: 1 });
  assert.equal((await readState(db, "2")).revision, 0);
});
test("missing revision, invalid and duplicate IDs reject before changing stored data", async () => {
  const db = database();
  await assert.rejects(writeState(db, "1", "device1", sample(), undefined, "a"), { status: 428 });
  const state = sample();
  state.trips.push(structuredClone(state.trips[0]));
  await assert.rejects(writeState(db, "1", "device1", state, 0, "b"), { code: "INVALID_STATE" });
  assert.equal((await readState(db, "1")).revision, 0);
});

test("receipt retention is bounded and expired retries cannot overwrite newer state", async () => {
  const db = database();
  const empty = { trips: [], savedPlaces: [], savedCategories: [] };
  for (let i = 0; i < 52; i++) await writeState(db, "1", "device1", empty, i, `request-${i}`);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM state_write_requests").get().n, 50);
  await assert.rejects(writeState(db, "1", "device1", empty, 0, "request-0"), { code: "REVISION_CONFLICT" });
  db.sqlite.prepare("UPDATE state_write_requests SET created_at=?").run(Date.now() - 25 * 60 * 60 * 1000);
  await assert.rejects(writeState(db, "1", "device1", empty, 51, "request-51"), { code: "REVISION_CONFLICT" });
  await writeState(db, "1", "device1", empty, 52, "request-52");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM state_write_requests").get().n, 1);
});

test("null records reject cleanly and long trip-name categories preserve names", async () => {
  const db = database();
  const state = sample();
  state.trips[0].title = "긴 여행 이름".repeat(10);
  state.savedCategories = [state.trips[0].title];
  state.savedPlaces[0].savedCategories = state.savedCategories;
  await writeState(db, "1", "device1", state, 0, "long");
  assert.deepEqual(await readState(db, "1"), { ...state, revision: 1 });
  await assert.rejects(writeState(db, "1", "device1", { ...state, trips: [null] }, 1, "null-trip"), {
    code: "INVALID_STATE",
  });
  state.trips[0].days = [null];
  await assert.rejects(writeState(db, "1", "device1", state, 1, "null-day"), { code: "INVALID_STATE" });
});

test("schedule times survive D1 roundtrip and reject invalid or orphaned values atomically", async () => {
  const db = database();
  const timed = sample();
  timed.trips[0].days[0].scheduleTimes = { start: "00:00", "place:p1": "12:30", goal: "23:59" };
  await writeState(db, "1", "time-device", timed, 0, "time-save");
  assert.deepEqual((await readState(db, "1")).trips[0].days[0].scheduleTimes, timed.trips[0].days[0].scheduleTimes);
  for (const bad of [
    { start: "24:00" },
    { start: "09:60" },
    { start: "9:00" },
    { start: null },
    { "place:missing": "10:00" },
    [],
  ]) {
    const invalid = structuredClone(timed);
    invalid.trips[0].days[0].scheduleTimes = bad;
    await assert.rejects(
      writeState(db, "1", "time-device", invalid, 1, "invalid-time"),
      (error) => error.status === 400,
    );
    assert.equal((await readState(db, "1")).revision, 1);
  }
  timed.trips[0].days[0].scheduleTimes = {};
  await writeState(db, "1", "time-device", timed, 1, "clear-time");
  assert.deepEqual((await readState(db, "1")).trips[0].days[0].scheduleTimes, {});
  db.sqlite.close();
});
