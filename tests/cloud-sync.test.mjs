import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = ts.transpileModule(readFileSync(new URL("../app/hooks/useCloudSync.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const empty = { trips: [], savedPlaces: [], savedCategories: [], revision: 1 };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

// Minimal effect scheduler: invokes the real hook with stable refs/callbacks and
// batches rerenders at microtask boundaries. No network or persistent data writes.
function harness(fetch, { storage = new Map(), initial = empty } = {}) {
  const slots = [];
  let cursor = 0;
  let queued = false;
  let layouts = [];
  let effects = [];
  let result;
  let props;
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => v !== b[i]);
  const rerender = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      render();
    });
  };
  const effect = (callback, deps, queue) => {
    const index = cursor++;
    const old = slots[index];
    if (changed(old?.deps, deps)) {
      slots[index] = { deps, cleanup: old?.cleanup };
      queue.push(() => {
        slots[index].cleanup?.();
        slots[index].cleanup = callback();
      });
    }
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [
        slots[index].value,
        (value) => {
          const next = typeof value === "function" ? value(slots[index].value) : value;
          if (next !== slots[index].value) {
            slots[index].value = next;
            rerender();
          }
        },
      ];
    },
    useRef(value) {
      const index = cursor++;
      return (slots[index] ??= { current: value });
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { deps, value: callback };
      return slots[index].value;
    },
    useLayoutEffect(callback, deps) {
      effect(callback, deps, layouts);
    },
    useEffect(callback, deps) {
      effect(callback, deps, effects);
    },
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: (name) => (name === "react" ? react : { initialTrip: (trips) => trips[0] }),
    fetch,
    queueMicrotask,
    crypto: { randomUUID },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    window: { setTimeout: () => 1, clearTimeout: () => {} },
  });
  function render() {
    cursor = 0;
    layouts = [];
    effects = [];
    result = exports.useCloudSync(props);
    layouts.forEach((run) => run());
    effects.forEach((run) => run());
  }
  const set = (key) => (value) => {
    props = { ...props, [key]: typeof value === "function" ? value(props[key]) : value };
    rerender();
  };
  props = {
    ...initial,
    apiBase: "/backend",
    tripsLoaded: true,
    savedLoaded: true,
    setTrips: set("trips"),
    setSavedPlaces: set("savedPlaces"),
    setSavedCategories: set("savedCategories"),
    setActiveTripId: () => {},
    setActiveDayId: () => {},
  };
  render();
  return {
    get result() {
      return result;
    },
    get props() {
      return props;
    },
    edit(categories) {
      set("savedCategories")(categories);
    },
  };
}

test("missing revision or failed initial GET never permits a write", async () => {
  for (const response of [reply({ trips: [], savedPlaces: [], savedCategories: [] }), reply({}, 503)]) {
    const calls = [];
    const h = harness(async (_, init) => {
      calls.push(init.method);
      return response;
    });
    await tick();
    h.edit(["local draft"]);
    await tick();
    await assert.rejects(h.result.flushPending());
    assert.deepEqual(calls, ["GET"]);
    assert.equal(h.result.cloudReady, false);
    assert.equal(h.result.syncStatus, "error");
  }
});

test("serializes writes and chains revision while preserving edits during PUT", async () => {
  const first = deferred();
  const writes = [];
  const h = harness(async (_, init) => {
    if (init.method === "GET") return reply(empty);
    const body = JSON.parse(init.body);
    writes.push(body);
    if (writes.length === 1) return first.promise;
    return reply({ ...body, revision: 3 });
  });
  await tick();
  h.edit(["first"]);
  await tick();
  const saving = h.result.flushPending();
  h.edit(["latest"]);
  await tick();
  assert.equal(writes.length, 1);
  first.resolve(reply({ ...empty, savedCategories: ["first"], revision: 2 }));
  await saving;
  await tick();
  assert.equal(writes.length, 2);
  assert.equal(writes[0].expectedRevision, 1);
  assert.equal(writes[1].expectedRevision, 2);
  assert.deepEqual(writes[1].savedCategories, ["latest"]);
  assert.deepEqual(h.props.savedCategories, ["latest"]);
  assert.equal(h.result.revision, 3);
});

test("retry uses identical request id and payload; conflict retains local draft", async () => {
  const writes = [];
  const h = harness(async (_, init) => {
    if (init.method === "GET") return reply(empty);
    writes.push(init.body);
    if (writes.length === 1) throw new Error("connection lost");
    return reply({}, 409);
  });
  await tick();
  h.edit(["draft"]);
  await tick();
  await assert.rejects(h.result.flushPending());
  await tick();
  h.edit(["new draft"]);
  await tick();
  await assert.rejects(h.result.flushPending());
  await tick();
  assert.equal(writes[0], writes[1]);
  assert.deepEqual(h.props.savedCategories, ["new draft"]);
  assert.equal(h.result.syncStatus, "conflict");
  await assert.rejects(h.result.flushPending());
  assert.equal(writes.length, 2);
});

test("successful reload applies empty server arrays", async () => {
  const h = harness(async () => reply(empty));
  await tick();
  h.edit(["draft"]);
  await tick();
  await h.result.reloadCloud({ discardLocal: true });
  await tick();
  assert.equal(h.props.savedCategories.length, 0);
  assert.equal(h.props.trips.length, 0);
});

test("command response never overwrites local edits made while command is running", async () => {
  const command = deferred();
  const h = harness(async (url) => (url.endsWith("/commands") ? command.promise : reply(empty)));
  await tick();
  const action = {
    id: "action-1",
    label: "삭제",
    command: { kind: "remove_place", tripId: "t", dayId: "d", placeId: "p" },
    expectedTripUpdatedAt: 1,
  };
  const applying = h.result.applyCommand(action);
  await tick();
  h.edit(["concurrent draft"]);
  await tick();
  const second = await h.result.applyCommand(action);
  assert.ok(second);
  command.resolve(reply({ ...empty, revision: 2 }));
  assert.ok(await applying);
  await tick();
  assert.deepEqual(h.props.savedCategories, ["concurrent draft"]);
  assert.equal(h.result.syncStatus, "conflict");
});

test("lost command responses retain exact command and block intervening writes", async () => {
  const bodies = [];
  const methods = [];
  const h = harness(async (url, init) => {
    methods.push(init.method);
    if (url.endsWith("/commands")) {
      bodies.push(init.body);
      if (bodies.length <= 2) throw new Error("response lost");
      return reply({ ...empty, revision: 2 });
    }
    return reply(empty);
  });
  await tick();
  const action = {
    id: "retry-action",
    command: { kind: "remove_place", tripId: "t", dayId: "d", placeId: "p" },
    expectedTripUpdatedAt: 1,
  };
  assert.ok(await h.result.applyCommand(action));
  await tick();
  h.edit(["keep local"]);
  await tick();
  await assert.rejects(h.result.reloadCloud());
  await assert.rejects(h.result.flushPending());
  assert.equal(await h.result.applyCommand(action), null);
  await tick();
  assert.equal(bodies.length, 3);
  assert.equal(new Set(bodies).size, 1);
  assert.ok(!methods.includes("PUT"));
  assert.deepEqual(h.props.savedCategories, ["keep local"]);
  assert.equal(h.result.syncStatus, "conflict");
});

test("an edit during initial read is kept and cannot overwrite server state", async () => {
  const read = deferred();
  const methods = [];
  const h = harness(async (_, init) => {
    methods.push(init.method);
    return read.promise;
  });
  await tick();
  h.edit(["edited while loading"]);
  await tick();
  read.resolve(reply(empty));
  await tick();
  assert.deepEqual(h.props.savedCategories, ["edited while loading"]);
  assert.equal(h.result.syncStatus, "conflict");
  await assert.rejects(h.result.flushPending());
  assert.deepEqual(methods, ["GET"]);
});

test("banner retry resolves an uncertain command without repeating completed actions", async () => {
  const writes = [];
  const h = harness(async (url, init) => {
    if (!url.endsWith("/commands")) return reply(empty);
    writes.push(init.body);
    if (writes.length < 3) throw new Error("response lost");
    return reply({ ...empty, savedCategories: ["confirmed"], revision: 2 });
  });
  await tick();
  const action = {
    id: "resume-from-banner",
    command: { kind: "remove_place", tripId: "t", dayId: "d", placeId: "p" },
    expectedTripUpdatedAt: 1,
  };
  assert.ok(await h.result.applyCommand(action));
  await tick();
  assert.equal(await h.result.flushPending(), 2);
  await tick();
  assert.equal(h.props.savedCategories[0], "confirmed");
  assert.equal(await h.result.applyCommand(action), null);
  assert.equal(writes.length, 3);
  assert.equal(new Set(writes).size, 1);
  assert.equal(h.result.syncStatus, "ready");
});

test("failed PUT followed by remount preserves the draft until explicit discard", async () => {
  const storage = new Map();
  const first = harness(
    async (_, init) => {
      if (init.method === "GET") return reply(empty);
      throw new Error("offline");
    },
    { storage },
  );
  await tick();
  first.edit(["unsaved trip category"]);
  await tick();
  await assert.rejects(first.result.flushPending());
  await tick();
  const calls = [];
  const restored = harness(
    async (_, init) => {
      calls.push(init.method);
      return reply(empty);
    },
    {
      storage,
      initial: { ...empty, savedCategories: [...first.props.savedCategories] },
    },
  );
  await tick();
  assert.deepEqual(restored.props.savedCategories, ["unsaved trip category"]);
  assert.equal(restored.result.syncStatus, "conflict");
  await assert.rejects(restored.result.flushPending());
  assert.deepEqual(calls, ["GET"]);
  await restored.result.reloadCloud({ discardLocal: true });
  await tick();
  assert.equal(restored.props.savedCategories.length, 0);
  const backup = JSON.parse(storage.get("gildam-sync:%2Fbackend:draft-backup"));
  assert.deepEqual(backup.state.savedCategories, ["unsaved trip category"]);
});

test("legacy first load backs up existing local state before replacing it", async () => {
  const storage = new Map();
  const h = harness(async () => reply(empty), {
    storage,
    initial: { ...empty, savedCategories: ["legacy category"] },
  });
  await tick();
  assert.equal(h.result.syncStatus, "ready");
  assert.equal(h.props.savedCategories.length, 0);
  const backup = JSON.parse(storage.get("gildam-sync:%2Fbackend:draft-backup"));
  assert.deepEqual(backup.state.savedCategories, ["legacy category"]);
});
