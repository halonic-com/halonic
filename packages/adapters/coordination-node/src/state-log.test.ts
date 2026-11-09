import type { RecordChange } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { defaultCoordinationCollection } from "./coordination.ts";
import { newWorld } from "./fakes.test-helper.ts";
import { StateLog } from "./state-log.ts";

const at = new Date(0).toISOString();

/** One change in the default collection. */
function change(id: string, op: RecordChange["op"], values: Record<string, unknown>): RecordChange {
  return { at, collection: defaultCoordinationCollection, id, op, values };
}

verifies("coordination-node.restart", () => {
  describe("loading a damaged log", () => {
    it.each([
      ["a value that isn't text", { kind: "value", key: "k", value: 7 }],
      ["a counter below zero", { kind: "counter", key: "k", value: -1 }],
      ["a counter that isn't whole", { kind: "counter", key: "k", value: 1.5 }],
      [
        "a counter above the largest safe whole number",
        { kind: "counter", key: "k", value: 2 ** 53 },
      ],
      ["a counter written as text", { kind: "counter", key: "k", value: "3" }],
      ["a lease without a token", { kind: "lease", key: "k", expiresAt: at }],
      [
        "a lease with an expiry that isn't a time",
        { kind: "lease", key: "k", token: "t", expiresAt: "soon" },
      ],
      ["a lease with its expiry in ms", { kind: "lease", key: "k", token: "t", expiresAt: 0 }],
      ["a window without a start", { kind: "window", key: "k", count: 1 }],
      ["a window with a count below zero", { kind: "window", key: "k", start: at, count: -1 }],
      ["a record of another kind", { kind: "timer", key: "k", value: "x" }],
      ["a record without a key", { kind: "value", value: "x" }],
      ["a record with a key that isn't text", { kind: "value", key: 1, value: "x" }],
      ["a record with no values", {}],
    ])("rejects %s, naming the record, and leaves the log as it is", async (_, values) => {
      const world = newWorld();
      const changes = [change('["x","k"]', "add", values)];
      await world.store.append(changes);
      const log = new StateLog(world.store, defaultCoordinationCollection, world.clock);

      await expect(log.load()).rejects.toThrow('Coordination record ["x","k"] is not a lease');
      expect(await world.store.changes(defaultCoordinationCollection)).toEqual(changes);
    });

    it("rejects an update whose add was never written, as after a half-written log", async () => {
      const world = newWorld();
      const changes = [change('["counter","k"]', "update", { value: 2 })];
      await world.store.append(changes);
      const log = new StateLog(world.store, defaultCoordinationCollection, world.clock);

      await expect(log.load()).rejects.toThrow('["counter","k"]');
      expect(await world.store.changes(defaultCoordinationCollection)).toEqual(changes);
    });

    it("loads an update that carries only the values that changed", async () => {
      const world = newWorld();
      await world.store.append([
        change('["window","k"]', "add", { kind: "window", key: "k", start: at, count: 1 }),
        change('["window","k"]', "update", { count: 2 }),
      ]);
      const log = new StateLog(world.store, defaultCoordinationCollection, world.clock);

      const state = await log.load();
      expect(state.windows.get("k")).toEqual({ start: 0, count: 2 });
    });

    it("loads nothing from a collection another one shares the store with", async () => {
      const world = newWorld();
      await world.store.append([
        {
          ...change('["value","k"]', "add", { kind: "value", key: "k", value: "x" }),
          collection: "other",
        },
      ]);
      const log = new StateLog(world.store, defaultCoordinationCollection, world.clock);

      const state = await log.load();
      expect(
        [state.leases, state.values, state.counters, state.windows].map((map) => map.size),
      ).toEqual([0, 0, 0, 0]);
      expect(await world.store.changes("other")).toHaveLength(1);
    });
  });
});
