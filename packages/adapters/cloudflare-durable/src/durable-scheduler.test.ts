import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { DurableScheduler } from "./durable-scheduler.ts";
import { ManualClock } from "./fakes.test-helper.ts";
import { NodeRunSql } from "./node/node-sql.spec.ts";
import type { RunObjectApi } from "./run-object-api.ts";
import { RunState } from "./run-state.ts";

/** A namespace of objects made on first use, each its own state, as Durable Objects are. */
function fakeNamespace() {
  const objects = new Map<string, RunObjectApi>();
  const clock = new ManualClock();
  return {
    names: [] as string[],
    gets: 0,
    idFromName(name: string): string {
      this.names.push(name);
      return name;
    },
    get(id: string): RunObjectApi {
      this.gets += 1;
      const existing = objects.get(id);
      if (existing !== undefined) return existing;
      const created = new RunState({
        sql: new NodeRunSql(),
        alarm: { set: async () => {}, clear: async () => {} },
        clock: () => clock,
        nap: async () => {},
        listener: () => ({ onTimer: async () => {} }),
      });
      objects.set(id, created);
      return created;
    },
  };
}

verifies("cloudflare-durable.timers", () => {
  describe("DurableScheduler", () => {
    it("keeps each key's timers in the object named after the key, behind the prefix", async () => {
      const namespace = fakeNamespace();
      const scheduler = new DurableScheduler({ namespace, namePrefix: "acme:" });
      const at = new Date(Date.UTC(2026, 0, 2)).toISOString();
      await scheduler.schedule("run_1", "wait", at);
      expect(await scheduler.pending("run_1")).toEqual([{ key: "run_1", timerId: "wait", at }]);
      expect(await scheduler.pending("run_2")).toEqual([]);
      await scheduler.cancel("run_1", "wait");
      expect(await scheduler.pending("run_1")).toEqual([]);
      expect(new Set(namespace.names)).toEqual(new Set(["acme:run_1", "acme:run_2"]));
    });

    it("names the object after the key alone without a prefix, with a fresh stub per call", async () => {
      const namespace = fakeNamespace();
      const scheduler = new DurableScheduler({ namespace });
      await scheduler.pending("run_1");
      await scheduler.pending("run_1");
      expect(namespace.names).toEqual(["run_1", "run_1"]);
      expect(namespace.gets).toBe(2);
    });
  });
});
