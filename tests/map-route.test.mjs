import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/domain/map-route.ts", import.meta.url), "utf8");
const exports = {};
new Function(
  "exports",
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
)(exports);
const { mapRouteKey, currentMapPath, validMapPath } = exports;
const start = { name: "용인", longitude: 127.1, latitude: 37.3 };
const goal = { name: "부산", longitude: 129.1, latitude: 35.1 };
const scope = { userId: 1, tripId: "trip", dayId: "day-1", mode: "schedule" };
const path = [
  [127.1, 37.3],
  [129.1, 35.1],
];

test("day two never uses day one geometry, even while pending or after failure", () => {
  const first = mapRouteKey(start, goal, [], scope);
  const second = mapRouteKey(goal, goal, [], { ...scope, dayId: "day-2" });
  assert.deepEqual(currentMapPath({ key: first, path }, second), []);
  assert.deepEqual(currentMapPath({ key: second, path: [] }, second), []);
  assert.deepEqual(currentMapPath({ key: first, path }, first), path);
});
test("late old responses cannot supply a different trip, day, candidate or route order", () => {
  const a = { ...start, id: "a" },
    b = { ...goal, id: "b" };
  const original = { key: mapRouteKey(start, goal, [a, b], scope), path };
  for (const key of [
    mapRouteKey(start, goal, [a, b], { ...scope, tripId: "other" }),
    mapRouteKey(start, goal, [a, b], { ...scope, dayId: "day-2" }),
    mapRouteKey(start, goal, [b, a], scope),
    mapRouteKey(start, goal, [{ ...a, longitude: 128 }, b], scope),
    mapRouteKey(start, goal, [a, b], { ...scope, mode: "preview" }),
    mapRouteKey(start, { ...goal, name: "목적지 미정" }, [a, b], scope),
  ])
    assert.deepEqual(currentMapPath(original, key), []);
});
test("memo and object identity changes do not re-request unchanged geometry", () => {
  assert.equal(
    mapRouteKey(start, goal, [{ ...start, memo: "a" }], scope),
    mapRouteKey({ ...start }, { ...goal }, [{ ...start, memo: "b" }], { ...scope }),
  );
});
test("empty or malformed API paths are cleared rather than reused", () => {
  for (const value of [null, undefined, [], [[null, 35]], [[999, 35]], [[129, NaN]], [[129]], "bad"])
    assert.deepEqual(validMapPath(value), []);
  assert.deepEqual(validMapPath(path), path);
});
