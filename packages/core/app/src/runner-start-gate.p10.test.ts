// P10 cases for running without the sandbox, at the one start gate (HAL-3386
// test plan, C1 and C3 to C5; Julian's condition (d) in the "Runs" line
// design, section 11, on HAL-1873). C2, a local tool never starting without
// the sandbox, is in `connector-stdio-sandbox`.

import {
  type Clock,
  type Sandbox,
  type SandboxCheck,
  type SandboxFence,
  type SandboxUnavailableReason,
  sandboxUnavailableReasons,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runnerFence, runnerUnfencedReasons } from "./runner-fence.ts";
import { type GatedRunner, RunnerStartGate } from "./runner-start-gate.ts";
import { TestUnfencedRunConsentStore } from "./testing/test-unfenced-run-consent-store.ts";
import { UnfencedRuns } from "./unfenced-runs.ts";

const clock: Clock = { now: () => new Date("2026-11-09T10:00:00.000Z") };
const passes: SandboxCheck = { ok: true, reason: null, missing: [] };

function fails(reason: SandboxUnavailableReason): SandboxCheck {
  return { ok: false, reason, missing: [] };
}

/** A runner whose close can be held open, to see what Take back waits for. */
class Runner implements GatedRunner {
  readonly startedIn: string;
  readonly fence: SandboxFence;
  readonly stopped: Promise<void>;
  closed = false;
  #release: () => void = () => undefined;
  readonly #held: Promise<void> | undefined;
  #stop!: () => void;

  constructor(startedIn: string, fence: SandboxFence, holdClose = false) {
    this.startedIn = startedIn;
    this.fence = fence;
    this.stopped = new Promise((resolve) => {
      this.#stop = resolve;
    });
    this.#held = holdClose
      ? new Promise((resolve) => {
          this.#release = resolve;
        })
      : undefined;
  }

  async close(): Promise<void> {
    await this.#held;
    this.closed = true;
    this.#stop();
  }

  /** Lets a held close finish. */
  release(): void {
    this.#release();
  }
}

interface Setup {
  /** The fence proof a runner in the fenced sandbox reports. */
  proof?: SandboxFence;
  /** Whether a runner's close waits for {@link Runner.release}. */
  holdClose?: boolean;
}

/** A gate on Linux whose fenced sandbox's check can change between the dialog and the start. */
function setup({ proof = { state: "fenced" }, holdClose = false }: Setup = {}) {
  const store = new TestUnfencedRunConsentStore();
  const runs = new UnfencedRuns({ store, clock });
  const state = { check: passes };
  const sandbox = (name: string): Sandbox & { name: string } => ({
    name,
    check: async () => (name === "fenced" ? state.check : passes),
    capabilities: () => ({ files: "shared", strength: name === "fenced" ? "os" : "none" }),
    open: async () => {
      throw new Error("the gate never opens a session itself");
    },
  });
  const gate = new RunnerStartGate({
    platform: "linux",
    fenced: sandbox("fenced"),
    launcher: sandbox("launcher"),
    runs,
  });
  const started: Runner[] = [];
  const startIn = async (picked: Sandbox) => {
    const name = (picked as Sandbox & { name: string }).name;
    const runner = new Runner(name, name === "fenced" ? proof : { state: "off" }, holdClose);
    started.push(runner);
    return runner;
  };
  /** What the trust check reads when it opens: the status at that moment. */
  const dialog = async () => runs.decide(runnerFence({ platform: "linux", check: state.check }));
  const startedIn = () => started.map((runner) => runner.startedIn);
  return { runs, state, gate, started, startIn, startedIn, dialog };
}

verifies("app.runner-start-gate", () => {
  describe("P10: a fence proof that fails at start (C1)", () => {
    it.each(runnerUnfencedReasons)(
      "stops the code and starts nothing in the launcher, even with a saved yes for %s",
      async (reason) => {
        const { gate, runs, started, startIn, startedIn } = setup({
          proof: { state: "not-fenced", reason: "the probe reached the canary port" },
        });
        await runs.allow(reason);
        expect(await gate.start(startIn)).toEqual({ run: "stopped" });
        expect(startedIn()).toEqual(["fenced"]);
        expect(started[0]?.closed).toBe(true);
      },
    );

    it("stops the code whose session ended while it started, and never falls back to the launcher", async () => {
      const { gate, runs, started, startIn, startedIn } = setup({ proof: { state: "stopped" } });
      await runs.allow("container");
      expect(await gate.start(startIn)).toEqual({ run: "stopped" });
      expect(startedIn()).toEqual(["fenced"]);
      expect(started[0]?.closed).toBe(true);
    });

    it("lets a refused fenced start fail, and never tries the launcher instead", async () => {
      const { gate, runs, started } = setup();
      await runs.allow("container");
      const tried: string[] = [];
      const refused = gate.start(async (picked) => {
        tried.push((picked as Sandbox & { name: string }).name);
        throw new Error("the session's fence is not-fenced, so it refuses to start");
      });
      await expect(refused).rejects.toThrow("refuses to start");
      expect(tried).toEqual(["fenced"]);
      expect(started).toEqual([]);
    });
  });

  describe("P10: the check passes at the dialog and fails at start (C3)", () => {
    it("asks for a yes at start, and starts nothing", async () => {
      const { gate, state, startIn, startedIn, dialog } = setup();
      expect(await dialog()).toEqual({ run: "fenced" });
      state.check = fails("container");
      expect(await gate.start(startIn)).toEqual({ run: "needs-yes", reason: "container" });
      expect(startedIn()).toEqual([]);
    });

    it("asks again with a yes for the same reason given before the last passing check", async () => {
      const { gate, runs, state, startIn, startedIn } = setup();
      state.check = fails("container");
      await runs.allow("container");
      expect((await gate.start(startIn)).run).toBe("unfenced");
      state.check = passes;
      expect((await gate.start(startIn)).run).toBe("fenced");
      state.check = fails("container");
      expect(await gate.start(startIn)).toEqual({ run: "needs-yes", reason: "container" });
      expect(startedIn()).toEqual(["launcher", "fenced"]);
    });

    it("asks again when the reason at start isn't the one the yes was given for at the dialog", async () => {
      const { gate, runs, state, startIn, startedIn, dialog } = setup();
      state.check = fails("container");
      expect(await dialog()).toEqual({ run: "needs-yes", reason: "container" });
      await runs.allow("container");
      state.check = fails("bubblewrap-missing");
      expect(await gate.start(startIn)).toEqual({
        run: "needs-yes",
        reason: "bubblewrap-missing",
      });
      expect(startedIn()).toEqual([]);
    });
  });

  describe("P10: Take back (C4)", () => {
    it("returns only once every run without the sandbox has stopped, and the next start asks again", async () => {
      const { gate, runs, state, started, startIn, startedIn } = setup({ holdClose: true });
      state.check = fails("container");
      await runs.allow("container");
      for (let i = 0; i < 3; i += 1) {
        expect((await gate.start(startIn)).run).toBe("unfenced");
      }
      let returned = false;
      const takingBack = runs.takeBack().then(() => {
        returned = true;
      });
      // Let Take back reach every close, then hold two of them open.
      await new Promise((resolve) => setTimeout(resolve, 0));
      started[0]?.release();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(returned).toBe(false);
      started[1]?.release();
      started[2]?.release();
      await takingBack;
      expect(started.map((runner) => runner.closed)).toEqual([true, true, true]);
      expect(await gate.start(startIn)).toEqual({ run: "needs-yes", reason: "container" });
      expect(startedIn()).toEqual(["launcher", "launcher", "launcher"]);
    });
  });

  describe("P10: a yes covers only its own reason (C5)", () => {
    it.each(sandboxUnavailableReasons)(
      "starts without the sandbox for %s only with a yes for exactly that reason",
      async (current) => {
        for (const saved of runnerUnfencedReasons) {
          const { gate, runs, state, startIn, startedIn } = setup();
          state.check = fails(current);
          await runs.allow(saved);
          const start = await gate.start(startIn);
          if (saved === current) {
            expect(start, `yes for ${saved}`).toMatchObject({ run: "unfenced", reason: current });
            expect(startedIn(), `yes for ${saved}`).toEqual(["launcher"]);
          } else {
            expect(start, `yes for ${saved}`).toEqual({ run: "needs-yes", reason: current });
            expect(startedIn(), `yes for ${saved}`).toEqual([]);
          }
        }
      },
    );
  });
});
