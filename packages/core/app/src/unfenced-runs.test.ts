import type { Clock } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RunnerFence } from "./runner-fence.ts";
import { TestUnfencedRunConsentStore } from "./testing/test-unfenced-run-consent-store.ts";
import { UnfencedRuns } from "./unfenced-runs.ts";

const nineNov = "2026-11-09T10:00:00.000Z";
const clock: Clock = { now: () => new Date(nineNov) };

function setup() {
  const store = new TestUnfencedRunConsentStore();
  return { store, runs: new UnfencedRuns({ store, clock }) };
}

const windows: RunnerFence = { state: "not-fenced", reason: "windows" };
const container: RunnerFence = { state: "not-fenced", reason: "container" };
const noBubblewrap: RunnerFence = { state: "not-fenced", reason: "bubblewrap-missing" };

verifies("app.unfenced-runs", () => {
  describe("deciding", () => {
    it("needs the user's yes the first time", async () => {
      const { runs } = setup();
      expect(await runs.decide(windows)).toEqual({ run: "needs-yes", reason: "windows" });
    });

    it("runs with a yes for the same reason, and gives its date", async () => {
      const { runs, store } = setup();
      await runs.allow("windows");
      expect(await store.get()).toEqual({ reason: "windows", allowedAt: nineNov });
      expect(await runs.decide(windows)).toEqual({
        run: "allowed",
        reason: "windows",
        allowedAt: nineNov,
      });
    });

    it("asks again when the reason changes", async () => {
      const { runs } = setup();
      await runs.allow("container");
      expect(await runs.decide(noBubblewrap)).toEqual({
        run: "needs-yes",
        reason: "bubblewrap-missing",
      });
      await runs.allow("bubblewrap-missing");
      expect(await runs.decide(container)).toEqual({ run: "needs-yes", reason: "container" });
    });

    it("asks again when the computer passed the sandbox check since the yes", async () => {
      const { runs, store } = setup();
      await runs.allow("bubblewrap-missing");
      expect(await runs.decide({ state: "fenced" })).toEqual({ run: "fenced" });
      expect(await store.get()).toBeNull();
      expect(await runs.decide(noBubblewrap)).toEqual({
        run: "needs-yes",
        reason: "bubblewrap-missing",
      });
    });

    it("asks again, and hands the host the error, when the yes can't be read", async () => {
      const { runs, store } = setup();
      await runs.allow("windows");
      store.breakConsent();
      const decision = await runs.decide(windows);
      expect(decision).toMatchObject({ run: "needs-yes", reason: "windows" });
      expect(decision.run === "needs-yes" && decision.error).toBeInstanceOf(Error);
    });

    it("never runs a stopped connection, even with a yes", async () => {
      const { runs } = setup();
      await runs.allow("windows");
      expect(await runs.decide({ state: "stopped" })).toEqual({ run: "stopped" });
    });
  });

  describe("taking it back", () => {
    it("stops every run without the sandbox before it returns, and asks again", async () => {
      const { runs } = setup();
      await runs.allow("windows");
      const stopped: string[] = [];
      runs.registerUnfencedRun(async () => {
        stopped.push("weather");
      });
      runs.registerUnfencedRun(async () => {
        stopped.push("home-station");
      });

      await runs.takeBack();
      expect(stopped).toEqual(["weather", "home-station"]);
      expect(await runs.decide(windows)).toEqual({ run: "needs-yes", reason: "windows" });
    });

    it("doesn't stop a run that already stopped by itself", async () => {
      const { runs } = setup();
      await runs.allow("windows");
      const stopped: string[] = [];
      const unregister = runs.registerUnfencedRun(async () => {
        stopped.push("weather");
      });
      unregister();
      await runs.takeBack();
      expect(stopped).toEqual([]);
    });

    it("stops the others and still takes the yes back when one fails to stop", async () => {
      const { runs, store } = setup();
      await runs.allow("windows");
      const stopped: string[] = [];
      runs.registerUnfencedRun(async () => {
        throw new Error("the runner didn't answer");
      });
      runs.registerUnfencedRun(async () => {
        stopped.push("home-station");
      });

      await expect(runs.takeBack()).rejects.toThrow(
        "1 of 2 plugins and integrations without the sandbox didn't stop.",
      );
      expect(stopped).toEqual(["home-station"]);
      expect(await store.get()).toBeNull();
    });
  });
});
