import type { Clock, Sandbox, SandboxCheck, SandboxFence } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type GatedRunner, RunnerStartGate } from "./runner-start-gate.ts";
import { TestUnfencedRunConsentStore } from "./testing/test-unfenced-run-consent-store.ts";
import { UnfencedRuns } from "./unfenced-runs.ts";

const nineNov = "2026-11-09T10:00:00.000Z";
const clock: Clock = { now: () => new Date(nineNov) };

const passes: SandboxCheck = { ok: true, reason: null, missing: [] };
const inContainer: SandboxCheck = { ok: false, reason: "container", missing: [] };

/** A sandbox the gate only checks and hands on; the start itself is faked. */
function sandbox(name: string, check: SandboxCheck = passes): Sandbox & { name: string } {
  return {
    name,
    check: async () => check,
    capabilities: () => ({ files: "shared", strength: name === "launcher" ? "none" : "os" }),
    open: async () => {
      throw new Error("the gate never opens a session itself");
    },
  };
}

/** A runner that records where it started and whether it was closed. */
class FakeRunner implements GatedRunner {
  closed = 0;
  readonly startedIn: string;
  readonly fence: SandboxFence;
  readonly stopped: Promise<void>;
  #stop!: () => void;
  #crash!: (error: Error) => void;

  constructor(startedIn: string, fence: SandboxFence) {
    this.startedIn = startedIn;
    this.fence = fence;
    this.stopped = new Promise((resolve, reject) => {
      this.#stop = resolve;
      this.#crash = reject;
    });
  }

  async close(): Promise<void> {
    this.closed += 1;
    this.#stop();
  }

  /** The runner stops by itself. */
  end(): void {
    this.#stop();
  }

  /** The runner stops with an error. */
  crash(error: Error): void {
    this.#crash(error);
  }
}

interface Setup {
  platform?: string;
  /** MXC on Windows 11: whether the sandbox choice has it in use, whether it counts as a fence, and its check. */
  mxc?: { inUse: boolean; fences: boolean; check?: SandboxCheck; proof?: SandboxFence };
  check?: SandboxCheck;
  /** The fence proof a runner reports, by the sandbox it started in. */
  proofs?: { fenced?: SandboxFence; launcher?: SandboxFence };
}

function setup({ platform = "linux", check = passes, proofs = {}, mxc }: Setup = {}) {
  const store = new TestUnfencedRunConsentStore();
  const runs = new UnfencedRuns({ store, clock });
  const fenced = sandbox("fenced", check);
  const launcher = sandbox("launcher");
  const gate = new RunnerStartGate({
    platform,
    fenced,
    launcher,
    runs,
    ...(mxc === undefined
      ? {}
      : {
          mxc: {
            sandbox: sandbox("mxc", mxc.check ?? passes),
            inUse: () => mxc.inUse,
            fencesRunner: mxc.fences,
          },
        }),
  });
  const started: FakeRunner[] = [];
  const backends: string[] = [];
  const startIn = async (picked: Sandbox, backend: string) => {
    backends.push(backend);
    const name = (picked as Sandbox & { name: string }).name;
    const proofByName: Record<string, SandboxFence> = {
      mxc: mxc?.proof ?? { state: "fenced" },
      fenced: proofs.fenced ?? { state: "fenced" },
      launcher: proofs.launcher ?? { state: "off" },
    };
    const proof = proofByName[name] ?? { state: "off" };
    const runner = new FakeRunner(name, proof);
    started.push(runner);
    return runner;
  };
  return { store, runs, gate, started, startIn, backends };
}

verifies("app.runner-start-gate", () => {
  describe("RunnerStartGate", () => {
    it("starts in the fenced sandbox when its check and the fence proof pass", async () => {
      const { gate, started, startIn } = setup();
      const start = await gate.start(startIn);
      expect(start.run).toBe("fenced");
      expect(started.map((runner) => runner.startedIn)).toEqual(["fenced"]);
    });

    it("stops a runner whose fence failed after the check passed, and never falls back to the launcher", async () => {
      const { gate, runs, started, startIn } = setup({
        proofs: { fenced: { state: "not-fenced", reason: "the canary port answered" } },
      });
      await runs.allow("container");
      expect(await gate.start(startIn)).toEqual({ run: "stopped" });
      expect(started.map((runner) => [runner.startedIn, runner.closed])).toEqual([["fenced", 1]]);
    });

    it("starts nothing without the user's yes for this reason", async () => {
      const { gate, runs, started, startIn } = setup({ check: inContainer });
      expect(await gate.start(startIn)).toEqual({ run: "needs-yes", reason: "container" });
      await runs.allow("bubblewrap-missing");
      expect(await gate.start(startIn)).toEqual({ run: "needs-yes", reason: "container" });
      expect(started).toEqual([]);
    });

    it("starts in the launcher with the yes for this reason, and Take back stops it", async () => {
      const { gate, runs, started, startIn } = setup({ check: inContainer });
      await runs.allow("container");
      const start = await gate.start(startIn);
      expect(start).toMatchObject({ run: "unfenced", reason: "container", allowedAt: nineNov });
      expect(started.map((runner) => runner.startedIn)).toEqual(["launcher"]);
      await runs.takeBack();
      expect(started[0]?.closed).toBe(1);
    });

    it("never uses the fenced sandbox on Windows, even when its check passes", async () => {
      const { gate, runs, started, startIn } = setup({ platform: "win32" });
      expect(await gate.start(startIn)).toEqual({ run: "needs-yes", reason: "windows" });
      await runs.allow("windows");
      expect((await gate.start(startIn)).run).toBe("unfenced");
      expect(started.map((runner) => runner.startedIn)).toEqual(["launcher"]);
    });

    it("starts in MXC on Windows when MXC is in use and counts as a fence", async () => {
      const { gate, started, startIn, backends } = setup({
        platform: "win32",
        mxc: { inUse: true, fences: true },
      });
      expect((await gate.start(startIn)).run).toBe("fenced");
      expect(started.map((runner) => runner.startedIn)).toEqual(["mxc"]);
      expect(backends).toEqual(["mxc"]);
    });

    it("keeps Windows not fenced while MXC doesn't yet count as a fence for the runner", async () => {
      const { gate, started, startIn } = setup({
        platform: "win32",
        mxc: { inUse: true, fences: false },
      });
      expect(await gate.start(startIn)).toEqual({ run: "needs-yes", reason: "windows" });
      expect(started).toEqual([]);
    });

    it("keeps Windows not fenced when the sandbox choice doesn't have MXC in use", async () => {
      const { gate, startIn } = setup({ platform: "win32", mxc: { inUse: false, fences: true } });
      expect(await gate.start(startIn)).toEqual({ run: "needs-yes", reason: "windows" });
    });

    it("stops an MXC runner whose fence failed, and never falls back to the launcher (A23)", async () => {
      const { gate, runs, started, startIn } = setup({
        platform: "win32",
        mxc: { inUse: true, fences: true, proof: { state: "not-fenced", reason: "went away" } },
      });
      await runs.allow("windows");
      expect(await gate.start(startIn)).toEqual({ run: "stopped" });
      expect(started.map((runner) => [runner.startedIn, runner.closed])).toEqual([["mxc", 1]]);
    });

    it("stops a runner that started while Take back ran", async () => {
      const { gate, runs, started } = setup({ check: inContainer });
      await runs.allow("container");
      const start = await gate.start(async (picked) => {
        // Take back runs after the gate decided, before the runner is registered.
        await runs.takeBack();
        const runner = new FakeRunner((picked as Sandbox & { name: string }).name, {
          state: "off",
        });
        started.push(runner);
        return runner;
      });
      expect(start).toEqual({ run: "needs-yes", reason: "container" });
      expect(started[0]?.closed).toBe(1);
    });

    it("refuses a launcher that claims a fence, and stops what it started", async () => {
      const { gate, runs, started, startIn } = setup({
        check: inContainer,
        proofs: { launcher: { state: "fenced" } },
      });
      await runs.allow("container");
      await expect(gate.start(startIn)).rejects.toThrow("not off");
      expect(started[0]?.closed).toBe(1);
    });

    it("forgets a runner that stopped by itself, so Take back doesn't stop it again", async () => {
      const { gate, runs, started, startIn } = setup({ check: inContainer });
      await runs.allow("container");
      await gate.start(startIn);
      started[0]?.end();
      await started[0]?.stopped;
      // Let the gate's handler unregister it.
      await Promise.resolve();
      await runs.takeBack();
      expect(started[0]?.closed).toBe(0);
    });

    it("forgets a runner that stopped with an error, and leaves no unhandled rejection", async () => {
      const { gate, runs, started, startIn } = setup({ check: inContainer });
      await runs.allow("container");
      await gate.start(startIn);
      const unhandled: unknown[] = [];
      const record = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", record);
      try {
        started[0]?.crash(new Error("the runner crashed"));
        await started[0]?.stopped.catch(() => undefined);
        // Give Node a turn to report a rejection nobody handled.
        await new Promise((resolve) => setTimeout(resolve, 0));
        await runs.takeBack();
        expect(started[0]?.closed).toBe(0);
        expect(unhandled).toEqual([]);
      } finally {
        process.off("unhandledRejection", record);
      }
    });
  });
});
