import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { NodeRunSql } from "./node/node-sql.spec.ts";
import { retryWaitMs, TimerTable } from "./timer-table.ts";

const key = "run_1";
const second = 1000;
const t0 = Date.UTC(2026, 0, 1);
const iso = (offsetMs: number) => new Date(t0 + offsetMs).toISOString();

/** The timer a test expects to find. */
function only<T>(timer: T | undefined): T {
  if (timer === undefined) throw new Error("Expected a due timer.");
  return timer;
}

function newTable(): TimerTable {
  return new TimerTable(new NodeRunSql());
}

verifies("cloudflare-durable.timers", () => {
  describe("TimerTable", () => {
    it("lists timers earliest first by the time they were set for", () => {
      const table = newTable();
      table.set(key, "b", iso(60 * second));
      table.set(key, "a", iso(second));
      expect(table.pending(key)).toEqual([
        { key, timerId: "a", at: iso(second) },
        { key, timerId: "b", at: iso(60 * second) },
      ]);
    });

    it("moves a timer that is set again and forgets its failures", () => {
      const table = newTable();
      table.set(key, "a", iso(0));
      const [first] = table.due(t0);
      table.finish(only(first), false, t0);
      table.set(key, "a", iso(10 * second));
      expect(table.pending(key)).toEqual([{ key, timerId: "a", at: iso(10 * second) }]);
      expect(table.due(t0 + 5 * second)).toEqual([]);
      expect(table.due(t0 + 10 * second)).toMatchObject([
        { timerId: "a", failures: 0, version: 2 },
      ]);
    });

    it("keeps each key's timers apart", () => {
      const table = newTable();
      table.set("run_1", "wait", iso(second));
      table.set("run_2", "wait", iso(second));
      table.cancel("run_1", "wait");
      expect(table.pending("run_1")).toEqual([]);
      expect(table.pending("run_2")).toHaveLength(1);
    });

    it("cancels a timer, and one that isn't set is fine", () => {
      const table = newTable();
      table.set(key, "a", iso(0));
      table.cancel(key, "a");
      table.cancel(key, "a");
      expect(table.pending(key)).toEqual([]);
      expect(table.earliestDueMs()).toBeNull();
    });

    it("finds the earliest due time, overdue or not, and the earliest one after now", () => {
      const table = newTable();
      expect(table.earliestDueAfter(t0)).toBeNull();
      table.set(key, "late", iso(60 * second));
      table.set(key, "early", iso(-second));
      table.set(key, "soon", iso(5 * second));
      expect(table.earliestDueMs()).toBe(t0 - second);
      expect(table.earliestDueAfter(t0)).toBe(t0 + 5 * second);
      expect(table.due(t0).map((timer) => timer.timerId)).toEqual(["early"]);
    });

    it("removes a delivered timer, and waits out a rejected one without dropping it", () => {
      const table = newTable();
      table.set(key, "done", iso(0));
      table.set(key, "failing", iso(0));
      const [done, failing] = table.due(t0);
      table.finish(only(done), true, t0);
      table.finish(only(failing), false, t0);
      expect(table.pending(key).map((timer) => timer.timerId)).toEqual(["failing"]);
      expect(table.due(t0 + second - 1)).toEqual([]);
      expect(table.due(t0 + second)).toMatchObject([{ timerId: "failing", failures: 1 }]);
    });

    it("leaves a timer set or cancelled during its call as it is", () => {
      const table = newTable();
      table.set(key, "moved", iso(0));
      table.set(key, "cancelled", iso(0));
      const [cancelled, moved] = table.due(t0);
      table.set(key, "moved", iso(10 * 60 * second));
      table.cancel(key, "cancelled");
      table.finish(only(moved), true, t0);
      table.finish(only(cancelled), false, t0);
      expect(table.pending(key)).toEqual([{ key, timerId: "moved", at: iso(10 * 60 * second) }]);
      table.finish(only(moved), false, t0);
      expect(table.due(t0 + 10 * 60 * second)).toMatchObject([{ timerId: "moved", failures: 0 }]);
    });

    it("refuses a timer id over 256 UTF-8 bytes and a time that isn't one", () => {
      const table = newTable();
      expect(() => table.set(key, "é".repeat(129), iso(0))).toThrow(RangeError);
      table.set(key, "é".repeat(128), iso(0));
      expect(() => table.set(key, "a", "tomorrow")).toThrow(RangeError);
      expect(() => table.set("é".repeat(129), "a", iso(0))).toThrow(RangeError);
    });

    it("waits 1 second after the first failure, doubling, at most 15 minutes", () => {
      expect([1, 2, 3, 4].map(retryWaitMs)).toEqual([1000, 2000, 4000, 8000]);
      expect(retryWaitMs(11)).toBe(15 * 60 * second);
      expect(retryWaitMs(40)).toBe(15 * 60 * second);
    });
  });
});
