import type { ScheduledTimer } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import {
  failuresBeforeStuck,
  type GaveUpRun,
  type RetriedFailure,
  retriedLine,
  type StuckRunHandlers,
  type StuckTimer,
  stuckForBeforeGivingUpMs,
  stuckTimerWatch,
} from "./stuck-timers.ts";

const timer = (key: string, timerId = "step"): ScheduledTimer => ({
  key,
  timerId,
  at: "2026-11-10T14:01:00.000Z",
});

/**
 * What `routines watch` passes, on a clock the test moves with `pass`.
 * `cancel` works unless given a rejection; the runs it cancelled and those
 * the watch gave up on are kept.
 */
function stuckRuns(cancelError?: Error) {
  let now = Date.parse("2026-11-10T14:00:00.000Z");
  const stuck: StuckTimer[] = [];
  const cancelled: string[] = [];
  const gaveUp: GaveUpRun[] = [];
  const handlers: StuckRunHandlers = {
    clock: { now: () => new Date(now) },
    onStuck: (timer) => stuck.push(timer),
    cancel: async (runId) => {
      cancelled.push(runId);
      if (cancelError !== undefined) throw cancelError;
    },
    onGaveUp: (run) => gaveUp.push(run),
  };
  const pass = (ms: number) => {
    now += ms;
  };
  return { handlers, pass, stuck, cancelled, gaveUp };
}

/** Lets a give-up's cancel settle. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

verifies("cli.run", () => {
  it("lets the scheduler retry a timer that failed fewer than three times", () => {
    const watch = stuckTimerWatch();

    watch.report(new Error("first"), timer("run_a"));
    watch.report(new Error("second"), timer("run_a"));
    watch.report(new Error("other run"), timer("run_b"));

    expect(failuresBeforeStuck).toBe(3);
    expect(watch.signal.aborted).toBe(false);
  });

  it("stops with the error once the same timer failed three times", () => {
    const watch = stuckTimerWatch();
    const third = new Error("third");

    watch.report(new Error("first"), timer("run_a"));
    watch.report(new Error("second"), timer("run_a"));
    watch.report(third, timer("run_a"));
    watch.report(new Error("fourth"), timer("run_a"));

    expect(watch.signal.aborted).toBe(true);
    expect(watch.signal.reason).toBe(third);
  });

  it("counts only failures in a row: one that worked starts the count again", () => {
    const watch = stuckTimerWatch();

    for (let count = 0; count < failuresBeforeStuck; count += 1) {
      watch.report(new Error("busy"), "tick");
      watch.report(new Error("busy"), "tick");
      watch.succeeded("tick");
    }
    watch.report(new Error("busy"), "tick");

    expect(watch.signal.aborted).toBe(false);
  });

  it("starts only the count of the source that worked again", () => {
    const watch = stuckTimerWatch();
    const third = new Error("third");

    watch.report(new Error("first"), timer("run_a"));
    watch.report(new Error("second"), timer("run_a"));
    watch.succeeded("tick");
    watch.succeeded(timer("run_b"));
    watch.report(third, timer("run_a"));

    expect(watch.signal.reason).toBe(third);
  });

  it("counts the scheduler's own wake-up failures the same way", () => {
    const watch = stuckTimerWatch();

    for (let count = 0; count < failuresBeforeStuck; count += 1) {
      watch.report(new Error("disk"), "wake-up");
    }

    expect(watch.signal.aborted).toBe(true);
  });
});

verifies("cli.commands.routines.watch", () => {
  it("hands a timer's third failure to onStuck, once, and keeps the signal as it is", () => {
    const stuck: StuckTimer[] = [];
    const watch = stuckTimerWatch(undefined, {
      ...stuckRuns().handlers,
      onStuck: (timer) => stuck.push(timer),
    });
    const third = new Error("third");

    watch.report(new Error("first"), timer("run_a"));
    watch.report(new Error("second"), timer("run_a"));
    watch.report(third, timer("run_a"));
    watch.report(new Error("fourth"), timer("run_a"));

    expect(stuck).toEqual([{ error: third, timer: timer("run_a") }]);
    expect(watch.signal.aborted).toBe(false);
  });

  it("still stops at the scheduler's third wake-up failure with onStuck", () => {
    const watch = stuckTimerWatch(undefined, stuckRuns().handlers);

    for (let count = 0; count < failuresBeforeStuck; count += 1) {
      watch.report(new Error("disk"), "wake-up");
    }

    expect(watch.signal.aborted).toBe(true);
  });

  it("cancels the run once its timer has kept failing for an hour, once, and keeps the signal (HAL-5294)", async () => {
    const { handlers, pass, cancelled, gaveUp } = stuckRuns();
    const watch = stuckTimerWatch(undefined, handlers);
    const last = new Error("EISDIR");

    // The scheduler's backoff: 1 s, 2 s, 4 s … then every 15 minutes.
    let tries = 0;
    for (let wait = 1_000; gaveUp.length === 0 && tries < 100; wait = Math.min(wait * 2, 900_000)) {
      watch.report(last, timer("run_a"));
      tries += 1;
      await settled();
      pass(wait);
    }
    for (let more = 0; more < 3; more += 1) watch.report(new Error("again"), timer("run_a"));
    await settled();

    expect(stuckForBeforeGivingUpMs).toBe(3_600_000);
    expect(tries).toBe(14);
    expect(cancelled).toEqual(["run_a"]);
    expect(gaveUp).toEqual([{ error: last, timer: timer("run_a"), cancelled: true }]);
    expect(watch.holds(timer("run_a"))).toBe(false);
    expect(watch.signal.aborted).toBe(false);
  });

  it("holds the timer when cancelling its run fails too", async () => {
    const cancelError = new Error("run log unwritable");
    const { handlers, pass, gaveUp } = stuckRuns(cancelError);
    const watch = stuckTimerWatch(undefined, handlers);

    for (let count = 0; count < failuresBeforeStuck; count += 1) {
      watch.report(new Error("EISDIR"), timer("run_a"));
    }
    pass(stuckForBeforeGivingUpMs);
    watch.report(new Error("EISDIR"), timer("run_a"));
    await settled();

    expect(gaveUp).toEqual([
      { error: new Error("EISDIR"), timer: timer("run_a"), cancelled: false, cancelError },
    ]);
    expect(watch.holds(timer("run_a"))).toBe(true);
    expect(watch.holds(timer("run_b"))).toBe(false);
  });

  it("doesn't give up on a timer that worked again before the hour", async () => {
    const { handlers, pass, gaveUp } = stuckRuns();
    const watch = stuckTimerWatch(undefined, handlers);

    for (let count = 0; count < failuresBeforeStuck; count += 1) {
      watch.report(new Error("busy"), timer("run_a"));
    }
    pass(stuckForBeforeGivingUpMs - 1);
    watch.succeeded(timer("run_a"));
    // Its next failures start a new hour.
    for (let count = 0; count < failuresBeforeStuck; count += 1) {
      watch.report(new Error("busy"), timer("run_a"));
    }
    pass(stuckForBeforeGivingUpMs - 1);
    watch.report(new Error("busy"), timer("run_a"));
    await settled();

    expect(gaveUp).toEqual([]);
  });

  it("doesn't give up before the third failure, even after an hour asleep", async () => {
    const { handlers, pass, gaveUp } = stuckRuns();
    const watch = stuckTimerWatch(undefined, handlers);

    watch.report(new Error("busy"), timer("run_a"));
    pass(8 * stuckForBeforeGivingUpMs);
    watch.report(new Error("busy"), timer("run_a"));
    await settled();
    expect(gaveUp).toEqual([]);

    watch.report(new Error("busy"), timer("run_a"));
    await settled();
    expect(gaveUp).toHaveLength(1);
  });
});

verifies("cli.debug-lines", () => {
  it("passes each failure before the third on as a retry, and not the third", () => {
    const retries: RetriedFailure[] = [];
    const watch = stuckTimerWatch((failure) => retries.push(failure));

    watch.report(new Error("first"), timer("run_a"));
    watch.report(new Error("second"), timer("run_a"));
    watch.report(new Error("third"), timer("run_a"));

    expect(retries.map((retry) => retry.failures)).toEqual([1, 2]);
    expect(watch.signal.aborted).toBe(true);
  });

  it("names the timer, its run and the error in the retry's line", () => {
    const line = retriedLine({
      error: new Error("refused"),
      source: timer("run_a", "call:draft"),
      failures: 2,
    });

    expect(plainText(line)).toBe(
      "the engine's timer call:draft of run_a failed, try 2 of 3, retrying: refused",
    );
  });

  it("names the scheduler's own wake-up, which belongs to no run", () => {
    const line = retriedLine({ error: new Error("disk"), source: "wake-up", failures: 1 });

    expect(plainText(line)).toBe("the scheduler's wake-up failed, try 1 of 3, retrying: disk");
  });
});
