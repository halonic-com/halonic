import type { ScheduledTimer } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { type MakeScheduler, startScheduler } from "./scheduler-harness.ts";

const second = 1000;
const minute = 60 * second;
const maxRetryWait = 15 * minute;
const fail = async () => {
  throw new Error("listener failed");
};

type Started = Awaited<ReturnType<typeof startScheduler>>;

/**
 * The contract every {@link Scheduler} adapter passes, built through its
 * `SchedulerFactory` and a harness that moves the clock. Timers can arrive
 * late or twice (multi-cloud ADR 5.3), so the cases check that each timer
 * arrives at least once, never before its time, with the time it was set for;
 * they never count repeats.
 */
export function schedulerContract(name: string, make: MakeScheduler): void {
  verifies("contracts.scheduler", () => {
    describe(`Scheduler contract: ${name}`, () => {
      deliveryCases(make);
      changeCases(make);
      retryCases(make);
      duringCallCases(make);
      tickAndLimitCases(make);
    });
  });
}

/**
 * The timers delivered so far, repeats removed, in the order they first
 * arrived. Fails the test when any delivery arrived before the time it was set for.
 */
function delivered(s: Started): ScheduledTimer[] {
  const { timers, arrivals } = s.listener;
  timers.forEach((timer, index) => {
    expect(arrivals[index], `${timer.timerId} arrived early`).toBeGreaterThanOrEqual(
      Date.parse(timer.at),
    );
  });
  const seen = new Set<string>();
  return timers.filter((timer) => {
    const id = JSON.stringify([timer.key, timer.timerId, timer.at]);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Makes the listener reject until the timer has arrived at `failures`
 * different clock times, and returns those times. A repeat at the same time
 * isn't a new try, so duplicate deliveries don't change the count.
 */
function failFirstTries(s: Started, failures: number): number[] {
  const tries: number[] = [];
  s.listener.behaviour = async () => {
    const now = s.clock.now().getTime();
    if (tries.at(-1) !== now) tries.push(now);
    if (tries.length <= failures) await fail();
  };
  return tries;
}

function deliveryCases(make: MakeScheduler): void {
  it("delivers a timer when it is due and not before, with the time it was set for", async () => {
    const s = await startScheduler(make);
    const at = s.inMs(5 * second);
    await s.scheduler.schedule("run_1", "wait", at);
    expect(await s.scheduler.pending("run_1")).toEqual([{ key: "run_1", timerId: "wait", at }]);
    await s.wait(4 * second);
    expect(delivered(s)).toEqual([]);
    await s.wait(second);
    await s.wait(minute);
    expect(delivered(s)).toEqual([{ key: "run_1", timerId: "wait", at }]);
    expect(await s.scheduler.pending("run_1")).toEqual([]);
  });

  it("delivers a late timer with the time it was set for, not the time it arrived", async () => {
    const s = await startScheduler(make);
    const at = s.inMs(second);
    await s.scheduler.schedule("run_1", "timeout", at);
    await s.wait(10 * minute);
    expect(delivered(s)).toEqual([{ key: "run_1", timerId: "timeout", at }]);
  });

  it("treats a time in the past as due at once", async () => {
    const s = await startScheduler(make);
    const at = s.inMs(-minute);
    await s.scheduler.schedule("run_1", "late", at);
    await s.wait(0);
    expect(delivered(s)).toEqual([{ key: "run_1", timerId: "late", at }]);
  });
}

function changeCases(make: MakeScheduler): void {
  it("moves a timer that is set again, so it is delivered at the new time and never the old", async () => {
    const s = await startScheduler(make);
    await s.scheduler.schedule("run_1", "wait", s.inMs(second));
    const moved = s.inMs(minute);
    await s.scheduler.schedule("run_1", "wait", moved);
    expect(await s.scheduler.pending("run_1")).toEqual([
      { key: "run_1", timerId: "wait", at: moved },
    ]);
    await s.wait(30 * second);
    expect(delivered(s)).toEqual([]);
    await s.wait(30 * second);
    await s.wait(minute);
    expect(delivered(s)).toEqual([{ key: "run_1", timerId: "wait", at: moved }]);
  });

  it("cancels a timer, and cancelling one that isn't set is fine", async () => {
    const s = await startScheduler(make);
    await s.scheduler.schedule("run_1", "wait", s.inMs(second));
    await s.scheduler.cancel("run_1", "wait");
    await s.scheduler.cancel("run_1", "wait");
    await s.scheduler.cancel("run_2", "never");
    await s.wait(minute);
    expect(s.listener.timers).toEqual([]);
  });

  it("lists a key's timers earliest first, and only that key's", async () => {
    const s = await startScheduler(make);
    const [early, late] = [s.inMs(second), s.inMs(minute)];
    await s.scheduler.schedule("run_1", "b", late);
    await s.scheduler.schedule("run_1", "a", early);
    await s.scheduler.schedule("run_2", "c", early);
    expect(await s.scheduler.pending("run_1")).toEqual([
      { key: "run_1", timerId: "a", at: early },
      { key: "run_1", timerId: "b", at: late },
    ]);
    expect(await s.scheduler.pending("run_3")).toEqual([]);
  });
}

function retryCases(make: MakeScheduler): void {
  it("delivers a rejected timer again after 1 second, then 2, then 4", async () => {
    const s = await startScheduler(make);
    const tries = failFirstTries(s, 3);
    const at = s.inMs(0);
    await s.scheduler.schedule("run_1", "step", at);
    await s.wait(0);
    for (const waitMs of [second, 2 * second, 4 * second]) {
      const before = tries.length;
      await s.wait(waitMs - 1);
      expect(tries).toHaveLength(before);
      await s.wait(1);
      expect(tries).toHaveLength(before + 1);
    }
    expect(delivered(s)).toEqual([{ key: "run_1", timerId: "step", at }]);
    expect(await s.scheduler.pending("run_1")).toEqual([]);
  });

  it("never waits more than 15 minutes between tries, and never drops the timer", async () => {
    const s = await startScheduler(make);
    const tries = failFirstTries(s, 12);
    await s.scheduler.schedule("run_1", "step", s.inMs(0));
    await s.wait(0);
    for (let failures = 1; failures <= 12; failures += 1) {
      await s.wait(Math.min(second * 2 ** (failures - 1), maxRetryWait));
      expect(tries, `after failure ${failures}`).toHaveLength(failures + 1);
    }
    expect(await s.scheduler.pending("run_1")).toEqual([]);
  });
}

function duringCallCases(make: MakeScheduler): void {
  it("delivers a timer that comes due while another timer's call is still running", async () => {
    const s = await startScheduler(make);
    const release = Promise.withResolvers<void>();
    s.listener.behaviour = async (timer) => {
      if (timer.timerId === "harness-call") await release.promise;
    };
    await s.scheduler.schedule("run_1", "harness-call", s.inMs(0));
    await s.scheduler.schedule("run_1", "start-limit", s.inMs(30 * second));

    const calling = s.wait(0);
    await vi.waitFor(() => expect(delivered(s).map((timer) => timer.timerId)).toHaveLength(1));
    const limited = s.wait(30 * second);
    await vi.waitFor(() =>
      expect(delivered(s).map((timer) => timer.timerId)).toEqual(["harness-call", "start-limit"]),
    );
    release.resolve();
    await Promise.all([calling, limited]);
  });

  it("keeps a timer that the listener set again while it ran, when the call resolves", async () => {
    const s = await startScheduler(make);
    const first = s.inMs(0);
    const next = s.inMs(10 * minute);
    s.listener.behaviour = async (timer) => {
      if (timer.at === first) await s.scheduler.schedule(timer.key, timer.timerId, next);
    };
    await s.scheduler.schedule("run_1", "retry", first);
    await s.wait(0);
    expect(await s.scheduler.pending("run_1")).toEqual([
      { key: "run_1", timerId: "retry", at: next },
    ]);
    await s.wait(10 * minute);
    expect(delivered(s).map((timer) => timer.at)).toEqual([first, next]);
  });

  it("keeps the time set during a call that rejects, instead of the retry wait", async () => {
    const s = await startScheduler(make);
    const first = s.inMs(0);
    const next = s.inMs(10 * minute);
    s.listener.behaviour = async (timer) => {
      await s.scheduler.schedule(timer.key, timer.timerId, next);
      await fail();
    };
    await s.scheduler.schedule("run_1", "retry", first);
    await s.wait(0);
    await s.wait(second);
    expect(delivered(s).map((timer) => timer.at)).toEqual([first]);
    expect(await s.scheduler.pending("run_1")).toEqual([
      { key: "run_1", timerId: "retry", at: next },
    ]);
  });

  it("drops a timer the listener cancelled while it ran, even when the call rejects", async () => {
    const s = await startScheduler(make);
    s.listener.behaviour = async (timer) => {
      await s.scheduler.cancel(timer.key, timer.timerId);
      await fail();
    };
    await s.scheduler.schedule("run_1", "wait", s.inMs(0));
    await s.wait(0);
    const arrived = s.listener.arrivals.length;
    await s.wait(maxRetryWait);
    expect(s.listener.arrivals).toHaveLength(arrived);
    expect(await s.scheduler.pending("run_1")).toEqual([]);
  });
}

function tickAndLimitCases(make: MakeScheduler): void {
  it("ticks about once a minute, and a tick that rejects stops nothing", async () => {
    const s = await startScheduler(make);
    s.listener.tickBehaviour = fail;
    await s.scheduler.schedule("run_1", "wait", s.inMs(2 * minute));
    await s.wait(minute);
    await s.wait(minute);
    expect(s.listener.ticks.length).toBeGreaterThanOrEqual(1);
    for (const at of s.listener.ticks) {
      expect(Date.parse(at)).toBeLessThanOrEqual(s.clock.now().getTime());
    }
    expect(delivered(s)).toHaveLength(1);
  });

  it("refuses a key or timer id over 256 UTF-8 bytes, and takes one of exactly 256", async () => {
    const s = await startScheduler(make);
    const at = s.inMs(minute);
    const tooLong = "é".repeat(129);
    await expect(s.scheduler.schedule(tooLong, "wait", at)).rejects.toThrow(RangeError);
    await expect(s.scheduler.schedule("run_1", tooLong, at)).rejects.toThrow(RangeError);
    const longest = "é".repeat(128);
    await s.scheduler.schedule(longest, longest, at);
    expect(await s.scheduler.pending(longest)).toEqual([{ key: longest, timerId: longest, at }]);
  });
}
