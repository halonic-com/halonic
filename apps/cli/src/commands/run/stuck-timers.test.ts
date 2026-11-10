import type { ScheduledTimer } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { failuresBeforeStuck, stuckTimerWatch } from "./stuck-timers.ts";

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
