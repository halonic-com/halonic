// The run state's alarm and log over a real Durable Object's storage and alarm (see `run-state.test.ts`).

import { entered, started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { sqlOfStorage } from "../run-sql.ts";
import { newState, rowsOf, second } from "./run-state-case.ts";
import { inObjectState } from "./state-host.ts";

export { StateHostObject } from "./state-host.ts";

describe("RunState alarm", () => {
  it("keeps the one alarm at the earliest due time, and removes it with no timer left", () =>
    inObjectState(async ({ storage }) => {
      const { state, clock, alarmAt, inMs } = newState(storage);
      const start = clock.now().getTime();
      await state.schedule("run_1", "late", inMs(60 * second));
      await state.schedule("run_1", "early", inMs(5 * second));
      expect(await alarmAt()).toBe(start + 5 * second);
      await state.cancel("run_1", "early");
      expect(await alarmAt()).toBe(start + 60 * second);
      await state.cancel("run_1", "late");
      expect(await alarmAt()).toBeNull();
    }));

  it("delivers what is due at the alarm and sets the alarm for the rest", () =>
    inObjectState(async ({ storage }) => {
      const { state, clock, alarmAt, delivered, inMs } = newState(storage);
      await state.schedule("run_1", "due", inMs(second));
      await state.schedule("run_1", "later", inMs(30 * second));
      clock.advance(second);
      await state.alarm();
      expect(delivered.map((timer) => timer.timerId)).toEqual(["due"]);
      expect(await state.pending("run_1")).toHaveLength(1);
      expect(await alarmAt()).toBe(clock.now().getTime() + 29 * second);
    }));

  it("sets the alarm again when delivery fails", () =>
    inObjectState(async ({ storage }) => {
      const { state, clock, alarmAt, inMs, onDelivery } = newState(storage);
      await state.schedule("run_1", "step", inMs(0));
      onDelivery(async () => {
        throw new Error("listener failed");
      });
      await state.alarm();
      expect(await alarmAt()).toBe(clock.now().getTime() + second);
    }));

  it("sets the alarm again, and rethrows, when the loop itself fails", () =>
    inObjectState(async ({ storage }) => {
      const { state, clock, alarmAt, inMs, onDelivery } = newState(storage, {
        nap: async () => {
          throw new Error("storage failed");
        },
      });
      onDelivery(() => new Promise<void>(() => {}));
      await state.schedule("run_1", "stuck", inMs(0));
      await state.schedule("run_1", "later", inMs(30 * second));
      await storage.deleteAlarm();
      await expect(state.alarm()).rejects.toThrow("storage failed");
      expect(await alarmAt()).toBe(clock.now().getTime());
    }));
});

describe("RunState log", () => {
  it("appends, reads and snapshots through the run log", () =>
    inObjectState(async ({ storage }) => {
      const { state } = newState(storage);
      expect(await state.events()).toEqual([]);
      expect(await state.snapshot()).toBeNull();
      const events = [started("r1"), entered("r1", 2)];
      expect(await state.append("r1", 0, events, { snapshot: { step: 2 } })).toEqual({
        ok: true,
        lastSeq: 2,
      });
      expect(await state.events(1)).toEqual([events[1]]);
      expect(await state.snapshot()).toEqual({ seq: 2, state: { step: 2 } });
    }));
});

describe("sqlOfStorage", () => {
  it("passes statements and transactions to the storage", () =>
    inObjectState(async ({ storage }) => {
      const sql = sqlOfStorage(storage);
      sql.exec("CREATE TABLE t (n INTEGER)");
      expect(sql.transactionSync(() => rowsOf(sql.exec("INSERT INTO t VALUES (?)", 1)))).toEqual(
        [],
      );
      expect(rowsOf(sql.exec("SELECT n FROM t"))).toEqual([{ n: 1 }]);
    }));
});
