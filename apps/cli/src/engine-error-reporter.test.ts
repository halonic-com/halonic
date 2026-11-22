import { LockLostError } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { engineErrorReporter } from "./engine-error-reporter.ts";
import { stuckTimerWatch } from "./stuck-timers.ts";

verifies("cli.engine-lock-lost", () => {
  describe("a lost engine lock", () => {
    it("stops the command at once, saying the engine stopped and what to do", () => {
      const stuck = stuckTimerWatch();
      const reportError = engineErrorReporter(stuck, () => {});

      const lost = new LockLostError("engine.lock", "was taken over by another process");
      reportError(lost, "engine-lock");

      expect(stuck.signal.aborted).toBe(true);
      expect(stuck.signal.reason).toMatchObject({
        kind: "conflict",
        message:
          "The engine stopped: this command was paused too long, such as while the computer slept, and lost its hold on this workspace.",
        fix: "Run the command again.",
        cause: lost,
      });
    });

    it("keeps the first reason when the command already stopped", () => {
      const stuck = stuckTimerWatch();
      const reportError = engineErrorReporter(stuck, () => {});
      const first = new Error("tick failed");
      stuck.stop(first);

      reportError(
        new LockLostError("engine.lock", "was taken over by another process"),
        "engine-lock",
      );

      expect(stuck.signal.reason).toBe(first);
    });

    it("counts a failed renewal as before: only three in a row stop the command", () => {
      const stuck = stuckTimerWatch();
      const reportError = engineErrorReporter(stuck, () => {});

      reportError(new Error("disk busy"), "engine-lock");
      reportError(new Error("disk busy"), "engine-lock");

      expect(stuck.signal.aborted).toBe(false);
    });
  });
});
