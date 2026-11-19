import type { Clock } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RunnerFence, RunnerUnfencedReason } from "./runner-fence.ts";
import { HandTimers } from "./testing/hand-timers.ts";
import { TestUnfencedRunConsentStore } from "./testing/test-unfenced-run-consent-store.ts";
import {
  savedYesCheckMs,
  stopTimeLimitMs,
  UnfencedRuns,
  type UnfencedRunYes,
} from "./unfenced-runs.ts";

const nineNov = "2026-11-09T10:00:00.000Z";
const clock: Clock = { now: () => new Date(nineNov) };
const aMomentLater: Clock = { now: () => new Date("2026-11-09T10:00:00.400Z") };

/** The yes given on 9 Nov for `reason`, as a run registers it. */
function yes(reason: RunnerUnfencedReason): UnfencedRunYes {
  return { reason, allowedAt: nineNov };
}

function setup() {
  const store = new TestUnfencedRunConsentStore();
  const timers = new HandTimers();
  return { store, timers, runs: new UnfencedRuns({ store, clock, timers }) };
}

/** Another process on the same computer: its own runs, the same saved yes. */
function otherProcess(store: TestUnfencedRunConsentStore, now: Clock = clock) {
  return new UnfencedRuns({ store, clock: now, timers: new HandTimers() });
}

/** A stop that never returns. */
function stopThatHangs(calls: string[], name: string) {
  return () => {
    calls.push(name);
    return new Promise<void>(() => undefined);
  };
}

/** Lets the checks and stops the timers started finish. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A start that stays in progress until the test finishes it. */
function startInProgress() {
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { finished, finish };
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
      runs.registerUnfencedRun(yes("windows"), async () => {
        stopped.push("weather");
      });
      runs.registerUnfencedRun(yes("windows"), async () => {
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
      const unregister = runs.registerUnfencedRun(yes("windows"), async () => {
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
      runs.registerUnfencedRun(yes("windows"), async () => {
        throw new Error("the runner didn't answer");
      });
      runs.registerUnfencedRun(yes("windows"), async () => {
        stopped.push("home-station");
      });

      await expect(runs.takeBack()).rejects.toThrow(
        "1 of 2 plugins and integrations without the sandbox didn't stop.",
      );
      expect(stopped).toEqual(["home-station"]);
      expect(await store.get()).toBeNull();
    });

    it("reports a run that doesn't stop within the time limit, and still stops the others", async () => {
      const { runs, store, timers } = setup();
      await runs.allow("windows");
      const stopped: string[] = [];
      runs.registerUnfencedRun(yes("windows"), stopThatHangs(stopped, "weather"));
      runs.registerUnfencedRun(yes("windows"), async () => {
        stopped.push("home-station");
      });

      const takingBack = runs.takeBack();
      await settle();
      expect(stopped).toEqual(["weather", "home-station"]);
      expect(timers.delays()).toContain(stopTimeLimitMs);
      timers.fire();
      await expect(takingBack).rejects.toThrow(
        "1 of 2 plugins and integrations without the sandbox didn't stop.",
      );
      expect(await store.get()).toBeNull();
    });

    it("waits for a start in progress, and returns only after it stopped what it started", async () => {
      const { runs } = setup();
      await runs.allow("windows");
      const { finished, finish } = startInProgress();
      const events: string[] = [];
      const starting = runs.whileStarting(async () => {
        await finished;
        events.push("start saw the yes was gone and stopped its runner");
      });

      const takenBack = runs.takeBack().then(() => events.push("taken back"));
      await settle();
      expect(events).toEqual([]);
      finish();
      await Promise.all([starting, takenBack]);
      expect(events).toEqual(["start saw the yes was gone and stopped its runner", "taken back"]);
    });

    it("still takes the yes back when a start in progress fails", async () => {
      const { runs, store } = setup();
      await runs.allow("windows");
      const starting = runs.whileStarting(async () => {
        throw new Error("the runner didn't start");
      });
      await runs.takeBack();
      await expect(starting).rejects.toThrow("the runner didn't start");
      expect(await store.get()).toBeNull();
    });
  });

  describe("taking it back in another process", () => {
    it("stops a run here at the next check after Take back in another process", async () => {
      const { runs, store, timers } = setup();
      await runs.allow("windows");
      const stopped: string[] = [];
      runs.registerUnfencedRun(yes("windows"), async () => {
        stopped.push("weather");
      });

      await otherProcess(store).takeBack();
      expect(timers.delays()).toEqual([savedYesCheckMs]);
      timers.fire();
      await settle();
      expect(stopped).toEqual(["weather"]);
      // Nothing is left to stop, so the yes isn't read again.
      expect(timers.delays()).toEqual([]);
    });

    it("keeps a run going, and checks again, while its yes is still saved", async () => {
      const { runs, timers } = setup();
      await runs.allow("windows");
      const stopped: string[] = [];
      runs.registerUnfencedRun(yes("windows"), async () => {
        stopped.push("weather");
      });

      timers.fire();
      await settle();
      expect(stopped).toEqual([]);
      expect(timers.delays()).toEqual([savedYesCheckMs]);
    });

    it("stops a run whose yes was replaced by one for another reason, or can't be read", async () => {
      const { runs, store, timers } = setup();
      await runs.allow("container");
      const stopped: string[] = [];
      runs.registerUnfencedRun(yes("container"), async () => {
        stopped.push("weather");
      });
      await otherProcess(store).allow("bubblewrap-missing");
      runs.registerUnfencedRun(yes("bubblewrap-missing"), async () => {
        stopped.push("home-station");
      });

      timers.fire();
      await settle();
      expect(stopped).toEqual(["weather"]);

      store.breakConsent();
      timers.fire();
      await settle();
      expect(stopped).toEqual(["weather", "home-station"]);
    });

    it("stops a run whose yes was taken back and given again before the next check", async () => {
      const { runs, store, timers } = setup();
      await runs.allow("windows");
      const stopped: string[] = [];
      runs.registerUnfencedRun(yes("windows"), async () => {
        stopped.push("weather");
      });

      // Studio takes the yes back and the user gives it again, within the second.
      const studio = otherProcess(store, aMomentLater);
      await studio.takeBack();
      await studio.allow("windows");
      timers.fire();
      await settle();
      expect(stopped).toEqual(["weather"]);
    });

    it("keeps checking for the other runs while one stop never returns, and stops it only once", async () => {
      const { runs, store, timers } = setup();
      await runs.allow("container");
      const stopped: string[] = [];
      runs.registerUnfencedRun(yes("container"), stopThatHangs(stopped, "weather"));
      await otherProcess(store).allow("bubblewrap-missing");
      runs.registerUnfencedRun(yes("bubblewrap-missing"), async () => {
        stopped.push("home-station");
      });

      timers.fire();
      await settle();
      expect(stopped).toEqual(["weather"]);
      expect(timers.delays()).toEqual([savedYesCheckMs]);

      await otherProcess(store).takeBack();
      timers.fire();
      await settle();
      expect(stopped).toEqual(["weather", "home-station"]);
      // The run that never stopped stays registered, so the checks go on.
      expect(timers.delays()).toEqual([savedYesCheckMs]);
    });

    it("tries again at the next check when a run fails to stop", async () => {
      const { runs, store, timers } = setup();
      await runs.allow("windows");
      let tries = 0;
      runs.registerUnfencedRun(yes("windows"), async () => {
        tries += 1;
        if (tries === 1) throw new Error("the runner didn't answer");
      });

      await store.remove();
      timers.fire();
      await settle();
      expect(tries).toBe(1);
      expect(timers.delays()).toEqual([savedYesCheckMs]);
      timers.fire();
      await settle();
      expect(tries).toBe(2);
      expect(timers.delays()).toEqual([]);
    });

    it("stops checking when the last run stops by itself", async () => {
      const { runs, timers } = setup();
      await runs.allow("windows");
      const unregister = runs.registerUnfencedRun(yes("windows"), async () => undefined);
      expect(timers.delays()).toEqual([savedYesCheckMs]);
      unregister();
      expect(timers.delays()).toEqual([]);
    });
  });
});
