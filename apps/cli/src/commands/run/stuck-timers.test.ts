import type { ScheduledTimer } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "../../messages/phrase.ts";
import {
  failuresBeforeStuck,
  type RetriedFailure,
  retriedLine,
  stuckTimerWatch,
} from "./stuck-timers.ts";

const timer = (key: string, timerId = "step"): ScheduledTimer => ({
  key,
  timerId,
  at: "2026-11-10T14:01:00.000Z",
});

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

  it("counts the scheduler's own wake-up failures the same way", () => {
    const watch = stuckTimerWatch();

    for (let count = 0; count < failuresBeforeStuck; count += 1) {
      watch.report(new Error("disk"), "wake-up");
    }

    expect(watch.signal.aborted).toBe(true);
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
