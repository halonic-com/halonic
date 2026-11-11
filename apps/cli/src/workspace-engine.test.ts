import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CommandContext } from "./command.ts";
import type { RoutineTicks } from "./local-engine-host.ts";
import { plainText } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { engineStart } from "./test/run-setup.ts";
import { openWorkspaceDir } from "./workspace-dir.ts";
import { openWorkspaceEngine, type WorkspaceEngineSetup } from "./workspace-engine.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";

const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-workspace-engine-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function setup(): WorkspaceEngineSetup {
  return {
    http: { fetch: () => Promise.reject(new TypeError("no server")) },
    profile: { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "home") } },
    sandboxGate: () => ({
      sandbox: { check: () => Promise.reject(new Error("Acme's agents need no sandbox.")) },
      placement: { where: () => Promise.reject(new Error("Acme's agents need no placement.")) },
    }),
  };
}

const context = (signal: AbortSignal): CommandContext =>
  ({
    cwd: acme,
    secrets: { get: async () => null },
    signal,
    debug: () => {},
  }) as unknown as CommandContext;

async function open(signal: AbortSignal) {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const workspace = await loadWorkspace(dir.store);
  return openWorkspaceEngine(context(signal), setup(), {
    dir,
    workspace,
    runs: [{ hubId: "support", workflowId: "support-reply" }],
    ending: runMessages.nothingRan(),
  });
}

verifies("cli.run", () => {
  it("aborts the engine's signal at Ctrl C, and not its stuck signal", async () => {
    const ctrlC = new AbortController();
    const engine = await open(ctrlC.signal);

    ctrlC.abort();
    await engine.close();

    expect([engine.signal.aborted, engine.stuck.aborted]).toEqual([true, false]);
  });

  it("leaves the signal alone until Ctrl C", async () => {
    const engine = await open(new AbortController().signal);
    await engine.close();

    expect(engine.signal.aborted).toBe(false);
  });
});

/**
 * Routines whose ticks fail or work as `outcomes` says, one per tick, on an
 * engine whose clock and wake-ups the test moves: {@link nextTick} moves the
 * clock a minute on and wakes the scheduler until that tick has run.
 * {@link failNextWakeUp} makes the wake-up after the next tick fail: the
 * scheduler can't set its next one. The `--debug` lines are in `debugLines`.
 */
async function openWithTicks(outcomes: readonly ("fail" | "ok")[]) {
  let now = engineStart;
  /** The wake-ups set, with the time each is due. */
  const wakeUps = new Map<() => void, number>();
  let failingWakeUps = 0;
  let wakeUpFailures = 0;
  const ticks: string[] = [];
  const debugLines: string[] = [];
  const routines: RoutineTicks = {
    onTick: async (at) => {
      const outcome = outcomes[ticks.length];
      ticks.push(at);
      if (outcome === "fail") throw new Error(`tick ${ticks.length} failed`);
    },
    dispose: async () => {},
  };
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const workspace = await loadWorkspace(dir.store);
  const engine = await openWorkspaceEngine(
    { ...context(new AbortController().signal), debug: (line) => debugLines.push(plainText(line)) },
    {
      ...setup(),
      engine: {
        clock: { now: () => new Date(now) },
        setTimer: (callback, delayMs) => {
          if (failingWakeUps > 0) {
            failingWakeUps -= 1;
            wakeUpFailures += 1;
            throw new Error(`wake-up ${wakeUpFailures} failed`);
          }
          wakeUps.set(callback, now + delayMs);
          return () => wakeUps.delete(callback);
        },
      },
    },
    { dir, workspace, runs: [], ending: runMessages.nothingRan(), routines: () => routines },
  );
  const nextTick = async () => {
    const count = ticks.length + 1;
    now += 60_000;
    await vi.waitFor(() => {
      for (const [callback, at] of [...wakeUps]) {
        if (at > now) continue;
        wakeUps.delete(callback);
        callback();
      }
      expect(ticks).toHaveLength(count);
    });
  };
  // The scheduler sets its first wake-up once it has read its timers; only later ones may fail.
  await vi.waitFor(() => expect(wakeUps.size).toBe(1));
  const failNextWakeUp = () => {
    failingWakeUps += 1;
  };
  return { engine, nextTick, failNextWakeUp, debugLines };
}

verifies("cli.commands.routines.watch", () => {
  it("keeps watching through failed ticks that a tick that worked separates", async () => {
    const { engine, nextTick } = await openWithTicks(["fail", "ok", "fail", "ok", "fail"]);
    try {
      for (let tick = 0; tick < 5; tick += 1) await nextTick();
      // The last failure is reported once its tick has settled.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(engine.stuck.aborted).toBe(false);
    } finally {
      await engine.close();
    }
  });

  it("stops at the third failed tick in a row, with its error", async () => {
    const { engine, nextTick } = await openWithTicks(["ok", "fail", "fail", "fail"]);
    try {
      for (let tick = 0; tick < 4; tick += 1) await nextTick();

      await vi.waitFor(() => expect(engine.stuck.aborted).toBe(true));
      expect(engine.stuck.reason).toEqual(new Error("tick 4 failed"));
    } finally {
      await engine.close();
    }
  });

  it("keeps watching through failed wake-ups that a wake-up that worked separates", async () => {
    const { engine, nextTick, failNextWakeUp, debugLines } = await openWithTicks([]);
    try {
      for (const outcome of ["fail", "ok", "fail", "ok", "fail"]) {
        if (outcome === "fail") failNextWakeUp();
        await nextTick();
      }

      // Each failure is the first in a row, so each is a retry --debug shows.
      await vi.waitFor(() =>
        expect(debugLines.filter((line) => line.includes("try 1 of 3"))).toHaveLength(3),
      );
      expect(engine.stuck.aborted).toBe(false);
    } finally {
      await engine.close();
    }
  });

  it("stops at the third failed wake-up in a row, with its error", async () => {
    const { engine, nextTick, failNextWakeUp } = await openWithTicks([]);
    try {
      for (let wakeUp = 0; wakeUp < 3; wakeUp += 1) {
        failNextWakeUp();
        await nextTick();
      }

      await vi.waitFor(() => expect(engine.stuck.aborted).toBe(true));
      expect(engine.stuck.reason).toEqual(new Error("wake-up 3 failed"));
    } finally {
      await engine.close();
    }
  });
});
