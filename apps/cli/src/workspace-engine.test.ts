import { cp, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileRecordStore } from "@halonicjs/adapter-fs-node";
import { profileFolder, workspaceFolders } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { CommandContext } from "./command.ts";
import { type RoutineTicks, runTimerCollection } from "./local-engine-host.ts";
import { plainText } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import type { GaveUpRun, StuckTimer } from "./stuck-timers.ts";
import { engineStart } from "./test/run-setup.ts";
import { waitUntil } from "./test/wait-until.test-helper.ts";
import { openWorkspaceDir } from "./workspace-dir.ts";
import { openWorkspaceEngine, type WorkspaceEngineSetup } from "./workspace-engine.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "./workspace-runs.ts";

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

const profile = () => ({
  ...nodeProfileEnvironment(),
  variables: { HALONIC_HOME: join(folder, "home") },
});

function setup(): WorkspaceEngineSetup {
  return {
    http: { fetch: () => Promise.reject(new TypeError("no server")) },
    profile: profile(),
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
 * clock a minute on, or the minutes given, and wakes the scheduler until
 * that tick has run; with `onStuck`, also until every wake-up it called
 * has settled, failed deliveries included.
 * {@link failNextWakeUp} makes the wake-up after the next tick fail: the
 * scheduler can't set its next one. The `--debug` lines are in `debugLines`.
 */
async function openWithTicks(
  outcomes: readonly ("fail" | "ok")[],
  onStuck?: (stuck: StuckTimer) => void,
  onGaveUp?: (gaveUp: GaveUpRun) => void,
) {
  let now = engineStart;
  /** The wake-ups set, with the time each is due. */
  const wakeUps = new Map<() => void, number>();
  let failingWakeUps = 0;
  let wakeUpFailures = 0;
  /** The wake-ups {@link nextTick} called, and those whose deliveries have settled. */
  let wakeUpsCalled = 0;
  let wakeUpsSettled = 0;
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
        onWokeUp: () => {
          wakeUpsSettled += 1;
        },
      },
    },
    {
      dir,
      workspace,
      runs: [],
      ending: runMessages.nothingRan(),
      routines: () => routines,
      ...(onStuck === undefined ? {} : { onStuck }),
      ...(onGaveUp === undefined ? {} : { onGaveUp }),
    },
  );
  const nextTick = async (minutes = 1) => {
    const count = ticks.length + 1;
    now += minutes * 60_000;
    await waitUntil(() => {
      for (const [callback, at] of [...wakeUps]) {
        if (at > now) continue;
        wakeUps.delete(callback);
        wakeUpsCalled += 1;
        callback();
      }
      // A stuck run's step reads its log from disk, which can outlast the tick on a slow
      // computer: the clock moves on only once that failure is in (HAL-5648).
      return ticks.length === count && (onStuck === undefined || wakeUpsSettled === wakeUpsCalled);
    });
    expect(ticks).toHaveLength(count);
    if (onStuck !== undefined) expect(wakeUpsSettled).toBe(wakeUpsCalled);
  };
  // The scheduler sets its first wake-up once it has read its timers; only later ones may fail.
  await waitUntil(() => wakeUps.size === 1);
  expect(wakeUps.size).toBe(1);
  const failNextWakeUp = () => {
    failingWakeUps += 1;
  };
  const elapsedMs = () => now - engineStart;
  return { engine, nextTick, failNextWakeUp, debugLines, elapsedMs };
}

/** The timer {@link plantStuckTimer} sets: a step of a run, due as the engine starts. */
const failingTimer = {
  key: "run_mfx3k2a1_09d9f0",
  timerId: "call:draft",
  at: new Date(engineStart).toISOString(),
};

async function acmeFolders() {
  return workspaceFolders(profileFolder(profile()), await realpath(acme), webCryptoDigest);
}

/** Where {@link failingTimer}'s run keeps its log. */
function stuckRunLog(folders: Awaited<ReturnType<typeof acmeFolders>>): string {
  return join(folders.runsFolder(), `${failingTimer.key}.jsonl`);
}

/**
 * Sets {@link failingTimer} in the engine's timers, with its run's log a
 * folder that can't be read as a file, so each time the engine carries out
 * that step it fails: the run is stuck. Call it before the engine opens.
 */
async function plantStuckTimer(): Promise<void> {
  const folders = await acmeFolders();
  await mkdir(stuckRunLog(folders), { recursive: true });
  await new FileRecordStore(folders.recordsFolder()).append([
    {
      at: failingTimer.at,
      collection: runTimerCollection,
      id: JSON.stringify([failingTimer.key, failingTimer.timerId]),
      op: "add",
      values: { ...failingTimer, failures: 0, dueAt: failingTimer.at },
    },
  ]);
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

      await waitUntil(() => engine.stuck.aborted);
      expect(engine.stuck.aborted).toBe(true);
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
      const retries = () => debugLines.filter((line) => line.includes("try 1 of 3"));
      await waitUntil(() => retries().length === 3);
      expect(retries()).toHaveLength(3);
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

      await waitUntil(() => engine.stuck.aborted);
      expect(engine.stuck.aborted).toBe(true);
      expect(engine.stuck.reason).toEqual(new Error("wake-up 3 failed"));
    } finally {
      await engine.close();
    }
  });

  it("hands a run whose step keeps failing to onStuck, once, and keeps watching (HAL-5064)", async () => {
    await plantStuckTimer();
    const stuck: StuckTimer[] = [];
    const { engine, nextTick } = await openWithTicks([], (timer) => stuck.push(timer));
    try {
      // Each tick delivers the timer once more: it fails 4 times.
      for (let tick = 0; tick < 4; tick += 1) await nextTick();
    } finally {
      // Closing waits for the last delivery, so its failure is counted.
      await engine.close();
    }

    expect(stuck).toEqual([{ error: expect.any(Error), timer: failingTimer }]);
    expect(engine.stuck.aborted).toBe(false);
  });

  it("gives up on a run whose step kept failing for an hour, once, and keeps watching (HAL-5294)", async () => {
    await plantStuckTimer();
    const gaveUp: GaveUpRun[] = [];
    const { engine, nextTick, elapsedMs } = await openWithTicks(
      [],
      () => {},
      (run) => gaveUp.push(run),
    );
    try {
      // A minute at a time while the scheduler's backoff is short, then its 15 minutes, up to the
      // first tick past the hour. The watch doesn't give up before it.
      while (elapsedMs() < 3_600_000) {
        expect(gaveUp).toEqual([]);
        await nextTick(elapsedMs() < 20 * 60_000 ? 1 : 15);
      }
      // The give-up's cancel goes to the disk and settles after the failure that set it off, so
      // wait for it, without moving the clock. The ceiling stays under the test timeout.
      await waitUntil(() => gaveUp.length > 0, { timeout: 4_000 });
      expect(gaveUp).toHaveLength(1);
      const gaveUpAfterMs = elapsedMs();
      // The run log can be read now, so a step tried again would work and its timer go.
      const folders = await acmeFolders();
      await rm(stuckRunLog(folders), { recursive: true });
      // Another hour: the watch goes on, and the held step is never tried.
      for (let tick = 0; tick < 4; tick += 1) await nextTick(15);

      expect(engine.stuck.aborted).toBe(false);
      expect(gaveUpAfterMs).toBeGreaterThanOrEqual(3_600_000);
      expect(gaveUpAfterMs).toBeLessThan(3_600_000 + 16 * 60_000);
      // The run log can't be written, so cancelling the run failed too.
      expect(gaveUp).toEqual([
        {
          error: expect.any(Error),
          timer: failingTimer,
          cancelled: false,
          cancelError: expect.any(Error),
        },
      ]);
    } finally {
      await engine.close();
    }
    // Still set, for the next engine on the workspace.
    const changes = await new FileRecordStore((await acmeFolders()).recordsFolder()).changes(
      runTimerCollection,
    );
    expect(changes.map((change) => change.op)).not.toContain("remove");
  });
});
