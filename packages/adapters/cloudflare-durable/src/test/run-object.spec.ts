// The run object's methods over a real Durable Object's state (see `run-object.test.ts`): each
// case builds the object inside a host object of its own and hands it that object's `ctx`.

import type { ScheduledTimer } from "@halonicjs/ports";
import { entered, started } from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { RunObject } from "../run-object.ts";
import { inObjectState } from "./state-host.ts";
import { SuiteClock } from "./suite-case.ts";

export { StateHostObject } from "./state-host.ts";

const second = 1000;

/** The Worker's subclass in miniature: a clock the test moves and a listener that records. */
class TestRunObject extends RunObject {
  readonly clockForTest = new SuiteClock();
  readonly delivered: ScheduledTimer[] = [];
  protected override clock = this.clockForTest;
  protected override nap = async () => {};
  readonly published: [string, number][] = [];
  protected override runList() {
    return {
      publish: async (summary: { id: string }, seq: number) =>
        void this.published.push([summary.id, seq]),
    };
  }
  protected override timerListener() {
    return { onTimer: async (timer: ScheduledTimer) => void this.delivered.push(timer) };
  }
}

/** A run object with no listener or run list, on a clock years ahead, so its alarm never fires. */
// @ts-expect-error No `runList`, as a Worker that exports the base class itself runs it.
class UnwiredRunObject extends RunObject {
  protected override clock = new SuiteClock();
}

describe("RunObject", () => {
  it("is its state's log, timers and alarm behind the object's methods", () =>
    inObjectState(async (state) => {
      const object = new TestRunObject(state, {});
      const events = [started("r1"), entered("r1", 2)];
      expect(await object.append("r1", 0, events, { snapshot: { step: 2 } })).toEqual({
        ok: true,
        lastSeq: 2,
      });
      expect(await object.events(1)).toEqual([events[1]]);
      expect(await object.snapshot()).toEqual({ seq: 2, state: { step: 2 } });
      expect((await object.summary())?.id).toBe("r1");
      expect(await state.storage.getAlarm()).toBe(object.clockForTest.now().getTime());
      await object.alarm();
      expect(object.published).toEqual([["r1", 2]]);

      const at = new Date(object.clockForTest.now().getTime() + second).toISOString();
      await object.schedule("r1", "wait", at);
      expect(await object.pending("r1")).toEqual([{ key: "r1", timerId: "wait", at }]);
      expect(await state.storage.getAlarm()).toBe(Date.parse(at));
      object.clockForTest.advance(second);
      await object.alarm();
      expect(object.delivered).toEqual([{ key: "r1", timerId: "wait", at }]);
      expect(await state.storage.getAlarm()).toBeNull();
      await object.schedule("r1", "again", at);
      await object.cancel("r1", "again");
      expect(await object.pending("r1")).toEqual([]);
    }));

  it("has no run list until the Worker's subclass gives one", () =>
    inObjectState(async (state) => {
      const object = new UnwiredRunObject(state, {});
      await object.append("r1", 0, [started("r1")]);
      expect(await object.alarm()).toBeUndefined();
      expect((await object.summary())?.id).toBe("r1");
    }));

  it("keeps a timer that is due, with the alarm set again, while no listener is given", () =>
    inObjectState(async (state) => {
      const object = new UnwiredRunObject(state, {});
      const at = new Date(Date.UTC(2026, 0, 1)).toISOString();
      await object.schedule("r1", "wait", at);
      await object.alarm();
      expect(await object.pending("r1")).toEqual([{ key: "r1", timerId: "wait", at }]);
      expect(await state.storage.getAlarm()).toBeGreaterThanOrEqual(Date.parse(at) + 1);
    }));
});
