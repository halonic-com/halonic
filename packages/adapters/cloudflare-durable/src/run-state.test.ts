import type { ScheduledTimer } from "@halonicjs/ports";
import { entered, started } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { ManualClock } from "./fakes.test-helper.ts";
import { NodeRunSql } from "./node/node-sql.spec.ts";
import { sqlOfStorage } from "./run-sql.ts";
import { type AlarmSlot, RunState } from "./run-state.ts";

const second = 1000;

/** The alarm as a Durable Object keeps it: one time, or none. */
class FakeAlarm implements AlarmSlot {
  at: number | null = null;
  async set(atMs: number): Promise<void> {
    this.at = atMs;
  }
  async clear(): Promise<void> {
    this.at = null;
  }
}

function newState(options: { nap?: () => Promise<void> } = {}) {
  const published: [string, number][] = [];
  let publishing: (summaryId: string) => Promise<void> = async () => {};
  const clock = new ManualClock();
  const alarm = new FakeAlarm();
  const delivered: ScheduledTimer[] = [];
  let behaviour: () => Promise<void> = async () => {};
  const state = new RunState({
    sql: new NodeRunSql(),
    alarm,
    clock: () => clock,
    nap: options.nap ?? (async () => {}),
    listener: () => ({
      onTimer: async (timer) => {
        delivered.push(timer);
        await behaviour();
      },
    }),
    runList: () => ({
      publish: async (summary, seq) => {
        await publishing(summary.id);
        published.push([summary.id, seq]);
      },
    }),
  });
  const inMs = (ms: number) => new Date(clock.now().getTime() + ms).toISOString();
  return {
    state,
    clock,
    alarm,
    delivered,
    inMs,
    published,
    onDelivery: (change: () => Promise<void>) => {
      behaviour = change;
    },
    onPublish: (change: (summaryId: string) => Promise<void>) => {
      publishing = change;
    },
  };
}

verifies("cloudflare-durable.timers", () => {
  describe("RunState alarm", () => {
    it("keeps the one alarm at the earliest due time, and removes it with no timer left", async () => {
      const { state, clock, alarm, inMs } = newState();
      const start = clock.now().getTime();
      await state.schedule("run_1", "late", inMs(60 * second));
      await state.schedule("run_1", "early", inMs(5 * second));
      expect(alarm.at).toBe(start + 5 * second);
      await state.cancel("run_1", "early");
      expect(alarm.at).toBe(start + 60 * second);
      await state.cancel("run_1", "late");
      expect(alarm.at).toBeNull();
    });

    it("delivers what is due at the alarm and sets the alarm for the rest", async () => {
      const { state, clock, alarm, delivered, inMs } = newState();
      await state.schedule("run_1", "due", inMs(second));
      await state.schedule("run_1", "later", inMs(30 * second));
      clock.advance(second);
      await state.alarm();
      expect(delivered.map((timer) => timer.timerId)).toEqual(["due"]);
      expect(await state.pending("run_1")).toHaveLength(1);
      expect(alarm.at).toBe(clock.now().getTime() + 29 * second);
    });

    it("sets the alarm again when delivery fails", async () => {
      const { state, clock, alarm, inMs, onDelivery } = newState();
      await state.schedule("run_1", "step", inMs(0));
      onDelivery(async () => {
        throw new Error("listener failed");
      });
      await state.alarm();
      expect(alarm.at).toBe(clock.now().getTime() + second);
    });

    it("sets the alarm again, and rethrows, when the loop itself fails", async () => {
      const { state, clock, alarm, inMs, onDelivery } = newState({
        nap: async () => {
          throw new Error("storage failed");
        },
      });
      onDelivery(() => new Promise<void>(() => {}));
      await state.schedule("run_1", "stuck", inMs(0));
      await state.schedule("run_1", "later", inMs(30 * second));
      alarm.at = null;
      await expect(state.alarm()).rejects.toThrow("storage failed");
      expect(alarm.at).toBe(clock.now().getTime());
    });
  });

  describe("RunState run list update", () => {
    const events = [started("r1"), entered("r1", 2)];

    it("notes an append in the outbox and sends the summary from the alarm, once", async () => {
      const { state, clock, alarm, published } = newState();
      await state.append("r1", 0, events);
      expect(published).toEqual([]);
      expect(alarm.at).toBe(clock.now().getTime());
      await state.alarm();
      expect(published).toEqual([["r1", 2]]);
      expect(alarm.at).toBeNull();
      await state.alarm();
      expect(published).toHaveLength(1);
    });

    it("sends nothing for an append that conflicts", async () => {
      const { state, alarm, published } = newState();
      await state.append("r1", 0, events);
      await state.alarm();
      alarm.at = null;
      expect(await state.append("r1", 1, [entered("r1", 2)])).toMatchObject({ ok: false });
      expect(alarm.at).toBeNull();
      await state.alarm();
      expect(published).toHaveLength(1);
    });

    it("retries a failed update on the alarm with the backoff, and sends the latest summary", async () => {
      const { state, clock, alarm, published, onPublish } = newState();
      onPublish(async () => {
        throw new Error("D1 is down");
      });
      await state.append("r1", 0, events);
      await state.alarm();
      expect(published).toEqual([]);
      expect(alarm.at).toBe(clock.now().getTime() + second);
      await state.append("r1", 2, [entered("r1", 3)]);
      clock.advance(second);
      onPublish(async () => {});
      await state.alarm();
      expect(published).toEqual([["r1", 3]]);
      expect(alarm.at).toBeNull();
    });

    it("keeps the note of an append made while its update was being sent", async () => {
      const { state, published, onPublish } = newState();
      await state.append("r1", 0, events);
      onPublish(async () => {
        await state.append("r1", 2, [entered("r1", 3)]);
      });
      await state.alarm();
      onPublish(async () => {});
      await state.alarm();
      expect(published).toEqual([
        ["r1", 2],
        ["r1", 3],
      ]);
    });

    it("sends an append's update while a timer's call is still running", async () => {
      const { state, published, inMs, onDelivery } = newState({
        nap: (_ms, signal) =>
          new Promise((resolve) => signal.addEventListener("abort", () => resolve())),
      });
      let endCall: () => void = () => {};
      const callEnds = new Promise<void>((resolve) => (endCall = resolve));
      let callStarted: () => void = () => {};
      const started = new Promise<void>((resolve) => (callStarted = resolve));
      onDelivery(async () => {
        callStarted();
        await callEnds;
      });
      await state.schedule("r1", "t1", inMs(0));
      const alarm = state.alarm();
      await started;
      await state.append("r1", 0, events);
      await vi.waitFor(() => expect(published).toEqual([["r1", 2]]));
      endCall();
      await alarm;
    });

    it("sends the update although a timer's delivery failed, and the reverse", async () => {
      const { state, clock, alarm, published, inMs, onDelivery } = newState({
        nap: async () => {
          throw new Error("storage failed");
        },
      });
      onDelivery(() => new Promise<void>(() => {}));
      await state.schedule("r1", "stuck", inMs(0));
      await state.schedule("r1", "later", inMs(30 * second));
      await state.append("r1", 0, events);
      await expect(state.alarm()).rejects.toThrow("storage failed");
      expect(published).toEqual([["r1", 2]]);
      expect(alarm.at).toBe(clock.now().getTime());
    });

    it("gives the summary from the log, and none for an empty log", async () => {
      const { state } = newState();
      expect(await state.summary()).toBeNull();
      await state.append("r1", 0, events);
      expect(await state.summary()).toMatchObject({ id: "r1", status: "running" });
    });
  });

  describe("RunState log", () => {
    it("appends, reads and snapshots through the run log", async () => {
      const { state } = newState();
      expect(await state.events()).toEqual([]);
      expect(await state.snapshot()).toBeNull();
      const events = [started("r1"), entered("r1", 2)];
      expect(await state.append("r1", 0, events, { snapshot: { step: 2 } })).toEqual({
        ok: true,
        lastSeq: 2,
      });
      expect(await state.events(1)).toEqual([events[1]]);
      expect(await state.snapshot()).toEqual({ seq: 2, state: { step: 2 } });
    });
  });

  describe("sqlOfStorage", () => {
    it("passes statements and transactions to the storage", () => {
      const inner = new NodeRunSql();
      const sql = sqlOfStorage({
        sql: inner,
        transactionSync: (change) => inner.transactionSync(change),
      });
      sql.exec("CREATE TABLE t (n INTEGER)");
      expect(sql.transactionSync(() => sql.exec("INSERT INTO t VALUES (?)", 1).toArray())).toEqual(
        [],
      );
      expect(sql.exec("SELECT n FROM t").toArray()).toEqual([{ n: 1 }]);
    });
  });
});
