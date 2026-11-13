import type { RunEvent } from "@halonicjs/events";
import { entered, started } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { NodeRunSql } from "./node/node-sql.spec.ts";
import { maxSnapshotBytes, RunLog } from "./run-log.ts";

function newLog(): RunLog {
  return new RunLog(new NodeRunSql());
}

verifies("cloudflare-durable.run-log", () => {
  describe("RunLog", () => {
    it("appends in order and reads the events after a sequence number", () => {
      const log = newLog();
      expect(log.append("r1", 0, [started("r1"), entered("r1", 2), entered("r1", 3)])).toEqual({
        ok: true,
        lastSeq: 3,
      });
      expect(log.events().map((event) => event.seq)).toEqual([1, 2, 3]);
      expect(log.events(1).map((event) => event.seq)).toEqual([2, 3]);
      expect(log.events(3)).toEqual([]);
      expect(log.lastSeq()).toBe(3);
    });

    it("gives nothing for an empty log", () => {
      const log = newLog();
      expect(log.events()).toEqual([]);
      expect(log.snapshot()).toBeNull();
      expect(log.lastSeq()).toBe(0);
    });

    it("answers a conflict with the current last seq and stores nothing, snapshot included", () => {
      const log = newLog();
      log.append("r1", 0, [started("r1"), entered("r1", 2)], { snapshot: { step: 2 } });
      expect(log.append("r1", 1, [entered("r1", 2)], { snapshot: { step: "late" } })).toEqual({
        ok: false,
        reason: "conflict",
        lastSeq: 2,
      });
      expect(log.events()).toHaveLength(2);
      expect(log.snapshot()).toEqual({ seq: 2, state: { step: 2 } });
    });

    it("keeps the latest snapshot, and the earlier one when an append has none", () => {
      const log = newLog();
      log.append("r1", 0, [started("r1")], { snapshot: { step: 1 } });
      log.append("r1", 1, [entered("r1", 2)]);
      expect(log.snapshot()).toEqual({ seq: 1, state: { step: 1 } });
      log.append("r1", 2, [entered("r1", 3)], { snapshot: null });
      expect(log.snapshot()).toEqual({ seq: 3, state: null });
    });

    it("leaves out a snapshot over the row limit but stores the events", () => {
      const log = newLog();
      log.append("r1", 0, [started("r1")], { snapshot: { step: 1 } });
      const tooBig = { blob: "x".repeat(maxSnapshotBytes) };
      expect(log.append("r1", 1, [entered("r1", 2)], { snapshot: tooBig })).toEqual({
        ok: true,
        lastSeq: 2,
      });
      expect(log.events()).toHaveLength(2);
      expect(log.snapshot()).toEqual({ seq: 1, state: { step: 1 } });
    });

    it("refuses a caller's bug with a RangeError and changes nothing", () => {
      const log = newLog();
      log.append("r1", 0, [started("r1")]);
      const bugs: [number, RunEvent[]][] = [
        [1, []],
        [1, [entered("r1", 3)]],
        [1, [entered("r2", 2)]],
        [-1, [started("r1")]],
      ];
      for (const [expectedSeq, events] of bugs) {
        expect(() => log.append("r1", expectedSeq, events)).toThrow(RangeError);
      }
      expect(log.events()).toHaveLength(1);
    });

    it("rolls back the events when the snapshot can't be stored", () => {
      const log = newLog();
      const circular: { self?: unknown } = {};
      circular.self = circular;
      expect(() => log.append("r1", 0, [started("r1")], { snapshot: circular })).toThrow(TypeError);
      expect(log.events()).toEqual([]);
      expect(log.lastSeq()).toBe(0);
    });
  });
});
