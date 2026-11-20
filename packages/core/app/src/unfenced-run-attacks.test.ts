// Attack tests for Take back across processes (P10 security review, HAL-1743).
// A CLI runs integration code without the sandbox through the real
// `RunnerStartGate`; Studio, another process on the same computer, shares the
// saved yes but not the CLI's runs. Each test takes the yes away from Studio at
// a different moment of the CLI's start or run, and checks the CLI's code
// stops and nothing new starts.

import type { Clock, Sandbox, SandboxCheck, SandboxFence } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type GatedRunner, RunnerStartGate } from "./runner-start-gate.ts";
import { HandTimers } from "./testing/hand-timers.ts";
import { TestUnfencedRunConsentStore } from "./testing/test-unfenced-run-consent-store.ts";
import { savedYesCheckMs, UnfencedRuns } from "./unfenced-runs.ts";

const clock: Clock = { now: () => new Date("2026-11-09T10:00:00.000Z") };

const inContainer: SandboxCheck = { ok: false, reason: "container", missing: [] };

/** A sandbox the gate only checks and hands on; the start itself is faked. */
function sandbox(name: string, check: () => SandboxCheck): Sandbox & { name: string } {
  return {
    name,
    check: async () => check(),
    capabilities: () => ({ files: "shared", strength: name === "launcher" ? "none" : "os" }),
    open: async () => {
      throw new Error("the gate never opens a session itself");
    },
  };
}

/** Integration code the CLI started, which counts how often it was closed. */
class Runner implements GatedRunner {
  closed = 0;
  readonly fence: SandboxFence;
  readonly stopped: Promise<void>;
  #stop!: () => void;

  constructor(fence: SandboxFence) {
    this.fence = fence;
    this.stopped = new Promise((resolve) => {
      this.#stop = resolve;
    });
  }

  async close(): Promise<void> {
    this.closed += 1;
    this.#stop();
  }
}

/** A step the test holds until it says so. */
function held() {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reach!: () => void;
  const reached = new Promise<void>((resolve) => {
    reach = resolve;
  });
  return { released, release, reached, reach };
}

/** Lets the checks and stops the timers started finish. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A computer whose sandbox check fails for `container`, with a CLI and
 * Studio sharing one saved yes. `check` can be changed to the computer
 * passing the check.
 */
function computer() {
  const store = new TestUnfencedRunConsentStore();
  const state = { check: inContainer };
  const cliTimers = new HandTimers();
  const cliRuns = new UnfencedRuns({ store, clock, timers: cliTimers });
  const gate = new RunnerStartGate({
    platform: "linux",
    fenced: sandbox("fenced", () => state.check),
    launcher: sandbox("launcher", () => state.check),
    runs: cliRuns,
    timers: new HandTimers(),
  });
  const studio = new UnfencedRuns({ store, clock, timers: new HandTimers() });
  const started: Runner[] = [];
  const startIn = async (picked: Sandbox) => {
    const runner = new Runner(
      (picked as Sandbox & { name: string }).name === "launcher"
        ? { state: "off" }
        : { state: "fenced" },
    );
    started.push(runner);
    return runner;
  };
  return { store, state, cliTimers, cliRuns, gate, studio, started, startIn };
}

verifies("app.unfenced-runs", () => {
  describe("Take back in Studio reaches the CLI's code without the sandbox", () => {
    it("stops a CLI runner Studio took the yes back from while it was starting", async () => {
      const { gate, studio, started } = computer();
      await studio.allow("container");
      const step = held();
      const start = gate.start(async () => {
        step.reach();
        await step.released;
        const runner = new Runner({ state: "off" });
        started.push(runner);
        return runner;
      });

      // The CLI read the yes and is starting the runner when Studio takes it back.
      await step.reached;
      await studio.takeBack();
      step.release();

      expect(await start).toEqual({ run: "needs-yes", reason: "container" });
      expect(started.map((runner) => runner.closed)).toEqual([1]);
    });

    it("starts nothing in the CLI after Take back in Studio", async () => {
      const { gate, studio, started, startIn } = computer();
      await studio.allow("container");
      await studio.takeBack();

      expect(await gate.start(startIn)).toEqual({ run: "needs-yes", reason: "container" });
      expect(started).toEqual([]);
    });

    it("stops every CLI runner at the next check, and reads the yes no more after", async () => {
      const { gate, studio, cliTimers, started, startIn } = computer();
      await studio.allow("container");
      for (let i = 0; i < 3; i += 1) {
        expect((await gate.start(startIn)).run).toBe("unfenced");
      }
      // One check for every run, not one each.
      expect(cliTimers.delays()).toEqual([savedYesCheckMs]);

      await studio.takeBack();
      cliTimers.fire();
      await settle();
      expect(started.map((runner) => runner.closed)).toEqual([1, 1, 1]);
      expect(cliTimers.delays()).toEqual([]);
    });

    it("stops a CLI runner once Studio saw the computer pass the sandbox check", async () => {
      const { gate, studio, cliTimers, started, startIn } = computer();
      await studio.allow("container");
      expect((await gate.start(startIn)).run).toBe("unfenced");

      // Studio's own start sees the sandbox pass, which removes the yes.
      expect(await studio.decide({ state: "fenced" })).toEqual({ run: "fenced" });
      cliTimers.fire();
      await settle();
      expect(started.map((runner) => runner.closed)).toEqual([1]);
    });

    it("keeps a fenced CLI runner going through Take back", async () => {
      const { gate, state, studio, cliTimers, started, startIn } = computer();
      state.check = { ok: true, reason: null, missing: [] };
      expect((await gate.start(startIn)).run).toBe("fenced");
      // A fenced run isn't registered, so nothing reads the yes for it.
      expect(cliTimers.delays()).toEqual([]);

      await studio.takeBack();
      expect(started.map((runner) => runner.closed)).toEqual([0]);
    });

    it("stops a CLI runner whose yes was given for another reason in Studio", async () => {
      const { gate, studio, cliTimers, started, startIn } = computer();
      await studio.allow("container");
      expect((await gate.start(startIn)).run).toBe("unfenced");

      // A yes for another reason is no yes for this run.
      await studio.allow("bubblewrap-missing");
      cliTimers.fire();
      await settle();
      expect(started.map((runner) => runner.closed)).toEqual([1]);
    });
  });
});
