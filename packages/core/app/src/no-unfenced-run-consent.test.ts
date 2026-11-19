import type { Clock } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { noUnfencedRunConsent } from "./no-unfenced-run-consent.ts";
import { HandTimers } from "./testing/hand-timers.ts";
import { UnfencedRuns } from "./unfenced-runs.ts";

const clock: Clock = { now: () => new Date("2026-11-18T10:00:00.000Z") };

verifies("app.no-unfenced-run-consent", () => {
  describe("noUnfencedRunConsent", () => {
    it("holds no yes, even after one is saved", async () => {
      await noUnfencedRunConsent.save({ reason: "windows", allowedAt: "2026-11-09T10:00:00.000Z" });
      expect(await noUnfencedRunConsent.get()).toBeNull();
      await noUnfencedRunConsent.remove();
      expect(await noUnfencedRunConsent.get()).toBeNull();
    });

    it("leaves every start without the sandbox needing a yes, even after allow", async () => {
      const runs = new UnfencedRuns({
        store: noUnfencedRunConsent,
        clock,
        timers: new HandTimers(),
      });
      await runs.allow("windows");
      expect(await runs.decide({ state: "not-fenced", reason: "windows" })).toEqual({
        run: "needs-yes",
        reason: "windows",
      });
    });

    it("lets a computer in the sandbox start in it", async () => {
      const runs = new UnfencedRuns({
        store: noUnfencedRunConsent,
        clock,
        timers: new HandTimers(),
      });
      expect(await runs.decide({ state: "fenced" })).toEqual({ run: "fenced" });
    });
  });
});
