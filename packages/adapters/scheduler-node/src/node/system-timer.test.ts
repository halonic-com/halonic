import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { systemSetTimer } from "./system-timer.ts";

/** Resolves once Node's timers due now have fired. */
function nextTimers(): Promise<void> {
  return new Promise((resolve) => systemSetTimer(resolve, 0));
}

verifies("scheduler-node.wake-up", () => {
  describe("the system timer", () => {
    it("calls back once the delay has passed", async () => {
      const calls: string[] = [];
      systemSetTimer(() => calls.push("woken"), 0);
      expect(calls).toEqual([]);
      await nextTimers();
      expect(calls).toEqual(["woken"]);
    });

    it("never calls back once cancelled", async () => {
      const calls: string[] = [];
      const cancel = systemSetTimer(() => calls.push("woken"), 0);
      cancel();
      await nextTimers();
      expect(calls).toEqual([]);
    });
  });
});
