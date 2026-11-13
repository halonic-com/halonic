import type { ScheduledTimer } from "@halonicjs/ports";
import { entered, started } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ManualClock } from "./fakes.test-helper.ts";
import { NodeRunSql } from "./node/node-sql.spec.ts";
import { RunObject } from "./run-object.ts";

const second = 1000;

/** The object's state as the part of Durable Object storage it uses: SQL, transactions and the alarm. */
function fakeState() {
  const sql = new NodeRunSql();
  const alarm = { at: null as number | null };
  const ctx = {
    storage: {
      sql,
      transactionSync: <T>(change: () => T) => sql.transactionSync(change),
      setAlarm: async (atMs: number) => {
        alarm.at = atMs;
      },
      deleteAlarm: async () => {
        alarm.at = null;
      },
    },
  };
  return { ctx, alarm };
}

/** The Worker's subclass in miniature: a clock the test moves and a listener that records. */
class TestRunObject extends RunObject {
  readonly clockForTest = new ManualClock();
  readonly delivered: ScheduledTimer[] = [];
  protected override clock = this.clockForTest;
  protected override nap = async () => {};
  protected override timerListener() {
    return { onTimer: async (timer: ScheduledTimer) => void this.delivered.push(timer) };
  }
}

verifies("cloudflare-durable.run-log", () => {
  describe("RunObject", () => {
    it("is its state's log, timers and alarm behind the object's methods", async () => {
      const { ctx, alarm } = fakeState();
      const object = new TestRunObject(ctx, {});
      const events = [started("r1"), entered("r1", 2)];
      expect(await object.append("r1", 0, events, { snapshot: { step: 2 } })).toEqual({
        ok: true,
        lastSeq: 2,
      });
      expect(await object.events(1)).toEqual([events[1]]);
      expect(await object.snapshot()).toEqual({ seq: 2, state: { step: 2 } });

      const at = new Date(object.clockForTest.now().getTime() + second).toISOString();
      await object.schedule("r1", "wait", at);
      expect(await object.pending("r1")).toEqual([{ key: "r1", timerId: "wait", at }]);
      expect(alarm.at).toBe(Date.parse(at));
      object.clockForTest.advance(second);
      await object.alarm();
      expect(object.delivered).toEqual([{ key: "r1", timerId: "wait", at }]);
      expect(alarm.at).toBeNull();
      await object.schedule("r1", "again", at);
      await object.cancel("r1", "again");
      expect(await object.pending("r1")).toEqual([]);
    });

    it("keeps a timer that is due, with the alarm set again, while no listener is given", async () => {
      const { ctx, alarm } = fakeState();
      const object = new RunObject(ctx, {});
      const at = new Date(Date.UTC(2026, 0, 1)).toISOString();
      await object.schedule("r1", "wait", at);
      await object.alarm();
      expect(await object.pending("r1")).toEqual([{ key: "r1", timerId: "wait", at }]);
      expect(alarm.at).toBeGreaterThan(Date.parse(at));
    });
  });
});
