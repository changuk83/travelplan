import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

test("drag follows pointer, commits only on release, and cancellation preserves order", () => {
  let frame,
    writes = 0,
    cleanup;
  const classes = () => ({ add() {}, remove() {} });
  const ghost = { removeAttribute() {}, querySelectorAll: () => [], classList: classes(), setAttribute() {} };
  const rows = [0, 1, 2].map((i) => ({
    classList: classes(),
    getBoundingClientRect: () => ({ top: 100 + i * 120, height: 100, left: 10, width: 300 }),
  }));
  const row = rows[0];
  row.cloneNode = () => ghost;
  row.querySelectorAll = () => [];
  row.closest = () => ({ querySelectorAll: () => rows });
  row.parentElement = null;
  let capture = false,
    layer;
  const handle = {
    closest: () => row,
    setPointerCapture() {
      capture = true;
    },
    hasPointerCapture: () => capture,
    releasePointerCapture() {
      capture = false;
    },
  };
  const doc = {
    createElement: () => (layer = { style: {}, appendChild() {}, remove() {} }),
    body: { appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
  };
  const win = { innerHeight: 800, addEventListener() {}, removeEventListener() {}, scrollBy() {} };
  const exports = {};
  const react = {
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, () => {}],
    useEffect: (callback) => {
      cleanup = callback();
    },
  };
  const source = ts.transpileModule(readFileSync(new URL("../app/hooks/useScheduleDrag.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function(
    "exports",
    "require",
    "document",
    "window",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "getComputedStyle",
    source,
  )(
    exports,
    () => react,
    doc,
    win,
    (callback) => {
      frame = callback;
      return 1;
    },
    () => {},
    () => ({}),
  );
  const initial = [{ id: "a" }, { id: "b" }, { id: "c" }];
  let places = initial;
  const hook = exports.useScheduleDrag({
    places,
    setPlaces: (fn) => {
      writes++;
      places = fn(places);
    },
  });
  const event = (type, y) => ({
    type,
    clientY: y,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    currentTarget: handle,
    preventDefault() {},
    stopPropagation() {},
  });
  hook.beginDrag(0, event("pointerdown", 120));
  hook.continueDrag(event("pointermove", 410));
  frame();
  assert.equal(writes, 0);
  assert.equal(layer.style.transform, "translateY(390px)");
  hook.endDrag(event("pointercancel", 410));
  assert.equal(writes, 0);
  assert.equal(capture, false);
  hook.beginDrag(0, event("pointerdown", 120));
  hook.continueDrag(event("pointermove", 410));
  frame();
  hook.endDrag(event("pointerup", 410));
  assert.equal(writes, 1);
  assert.deepEqual(
    places.map((p) => p.id),
    ["b", "c", "a"],
  );
  hook.endDrag(event("lostpointercapture", 410));
  assert.equal(writes, 1);
  cleanup();
});
