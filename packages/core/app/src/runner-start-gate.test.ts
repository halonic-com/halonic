import type { Clock, Sandbox, SandboxCheck, SandboxFence } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  type GatedRunner,
  RunnerStartGate,
  RunnerStartTimeoutError,
  runnerStartTimeoutMs,
} from "./runner-start-gate.ts";
import { HandTimers } from "./testing/hand-timers.ts";
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
  /** The host's own limit on a start. */
  startTimeoutMs?: number;
}

function setup({
  platform = "linux",
  check = passes,
  proofs = {},
  mxc,
  startTimeoutMs,
}: Setup = {}) {
  const store = new TestUnfencedRunConsentStore();
  const timers = new HandTimers();
  const runs = new UnfencedRuns({ store, clock, timers });
  const fenced = sandbox("fenced", check);
  const launcher = sandbox("launcher");
  const startTimers = new HandTimers();
  const gate = new RunnerStartGate({
    platform,
    fenced,
    launcher,
    runs,
    timers: startTimers,
    ...(startTimeoutMs === undefined ? {} : { startTimeoutMs }),
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
  return { store, timers, startTimers, runs, gate, started, startIn, backends };
}

/** A start that settles only when the test says, with a runner from the sandbox it was given. */
function heldStart() {
  let reached!: () => void;
  const startReached = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let arrive!: () => void;
  const arrives = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const runners: FakeRunner[] = [];
  const startIn = async (picked: Sandbox) => {
    reached();
    await arrives;
    const name = (picked as Sandbox & { name: string }).name;
    const runner = new FakeRunner(name, { state: name === "launcher" ? "off" : "fenced" });
    runners.push(runner);
    return runner;
  };
  return { startIn, startReached, arrive, runners };
}

/** Lets every promise that is ready settle. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
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

    it("stops a runner that was starting when Take back ran, before Take back returns", async () => {
      const { gate, runs, started } = setup({ check: inContainer });
      await runs.allow("container");
      let reachedStart!: () => void;
      const startReached = new Promise<void>((resolve) => {
        reachedStart = resolve;
      });
      let finishStart!: () => void;
      const startFinishes = new Promise<void>((resolve) => {
        finishStart = resolve;
      });
      const start = gate.start(async (picked) => {
        reachedStart();
        await startFinishes;
        const runner = new FakeRunner((picked as Sandbox & { name: string }).name, {
          state: "off",
        });
        started.push(runner);
        return runner;
      });

      // Take back runs after the gate decided, while the runner is still starting.
      await startReached;
      let takenBack = false;
      const takingBack = runs.takeBack().then(() => {
        takenBack = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(takenBack).toBe(false);

      finishStart();
      await takingBack;
      expect(started[0]?.closed).toBe(1);
      expect(await start).toEqual({ run: "needs-yes", reason: "container" });
    });

    it("stops a runner whose yes was taken back and given again while it was starting", async () => {
      const { gate, runs, store, timers, started } = setup({ check: inContainer });
      await runs.allow("container");
      const start = gate.start(async (picked) => {
        // Studio takes the yes back and the user gives it again, during the start.
        const studio = new UnfencedRuns({
          store,
          clock: { now: () => new Date("2026-11-09T10:00:00.400Z") },
          timers: new HandTimers(),
        });
        await studio.takeBack();
        await studio.allow("container");
        const runner = new FakeRunner((picked as Sandbox & { name: string }).name, {
          state: "off",
        });
        started.push(runner);
        return runner;
      });

      expect(await start).toEqual({ run: "needs-yes", reason: "container" });
      expect(started[0]?.closed).toBe(1);
      expect(timers.delays()).toEqual([]);
    });

    it("refuses a start that doesn't settle within the limit, and stops its runner when it arrives later", async () => {
      const { gate, startTimers } = setup();
      const held = heldStart();
      const start = gate.start(held.startIn);
      await held.startReached;
      expect(startTimers.delays()).toEqual([runnerStartTimeoutMs]);

      startTimers.fire();
      await expect(start).rejects.toThrow(RunnerStartTimeoutError);

      held.arrive();
      await settle();
      expect(held.runners.map((runner) => [runner.startedIn, runner.closed])).toEqual([
        ["fenced", 1],
      ]);
    });

    it("lets Take back return once a start without the sandbox that hangs runs out of time", async () => {
      const { gate, runs, startTimers } = setup({ check: inContainer });
      await runs.allow("container");
      const held = heldStart();
      const start = gate.start(held.startIn);
      start.catch(() => undefined);
      await held.startReached;

      let takenBack = false;
      const takingBack = runs.takeBack().then(() => {
        takenBack = true;
      });
      await settle();
      expect(takenBack).toBe(false);

      startTimers.fire();
      await takingBack;
      await expect(start).rejects.toThrow(RunnerStartTimeoutError);

      // The runner arrives after Take back returned; it is stopped, and never registered.
      held.arrive();
      await settle();
      expect(held.runners[0]?.closed).toBe(1);
      expect(await gate.start(held.startIn)).toEqual({ run: "needs-yes", reason: "container" });
    });

    it("keeps no limit waiting once a start settled, and passes the start's own error on", async () => {
      const { gate, startTimers, startIn } = setup();
      await gate.start(startIn);
      expect(startTimers.delays()).toEqual([]);

      await expect(
        gate.start(async () => {
          throw new Error("the sandbox didn't open");
        }),
      ).rejects.toThrow("the sandbox didn't open");
      expect(startTimers.delays()).toEqual([]);
    });

    it("keeps no limit waiting when the start throws straight away", async () => {
      const { gate, startTimers } = setup();
      await expect(
        gate.start(() => {
          throw new Error("the sandbox didn't open");
        }),
      ).rejects.toThrow("the sandbox didn't open");
      expect(startTimers.delays()).toEqual([]);
    });

    it("waits as long as the host's own limit says", async () => {
      const { gate, startTimers } = setup({ startTimeoutMs: 5000 });
      const held = heldStart();
      const start = gate.start(held.startIn);
      start.catch(() => undefined);
      await held.startReached;
      expect(startTimers.delays()).toEqual([5000]);
      startTimers.fire();
      await expect(start).rejects.toThrow("didn't start within 5 s");
    });

    it.each([0, -1, 1.5, Number.NaN])("refuses the limit %s", (startTimeoutMs) => {
      expect(() => setup({ startTimeoutMs })).toThrow(RangeError);
    });

    it("stops a runner here when the yes is taken back in another process", async () => {
      const { gate, runs, store, timers, started, startIn } = setup({ check: inContainer });
      await runs.allow("container");
      expect((await gate.start(startIn)).run).toBe("unfenced");

      // Studio, or a second CLI, shares the saved yes but not the runs.
      const studio = new UnfencedRuns({ store, clock, timers: new HandTimers() });
      await studio.takeBack();
      expect(started[0]?.closed).toBe(0);

      timers.fire();
      await new Promise((resolve) => setTimeout(resolve, 0));
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
