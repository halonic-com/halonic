// The open engine as the engine role sees it (`RunningEngine`): the shared
// local engine, its routine scheduler and its listener, with the health the
// role reports and the stop order of `agent-host.engine-role-lifecycle`.
// The Node parts are opened in `open-engine.ts`; this file only holds the
// order, so a test can drive it with fakes. The schedule's state is
// `EngineSchedule`, which `halonic serve` shares (`server.routines`).
import type { EngineSchedule } from "@halonicjs/app/routines";
import type { RunFailureCause } from "@halonicjs/events";
import type { Clock, RunStore } from "@halonicjs/ports";
import type { RunningEngine } from "./engine-role.ts";

export {
  EngineSchedule,
  type RunCounts,
  type TickingScheduler,
  type TickReadings,
} from "@halonicjs/app/routines";

/** Why the engine role ended a run whose step didn't end within the grace time. */
export const engineStoppedCause: RunFailureCause = {
  kind: "unavailable",
  code: "engine.stopped",
};

/** The local engine's parts the stop uses. */
export interface StoppableEngine {
  readonly runs: RunStore;
  readonly clock: Clock;
  /** Waits for the step in progress, then releases `engine.lock`. Safe to call twice. */
  close(): Promise<void>;
  /** Releases `engine.lock` now, though a step may still be going. */
  abandon(): Promise<void>;
}

/** What {@link runningEngine} is made of. */
export interface RunningEngineInput {
  readonly url: string;
  readonly token: string;
  readonly engine: StoppableEngine;
  readonly schedule: EngineSchedule;
  /** The engine API's listener. */
  readonly listener: { close(): Promise<void> };
  /** Resolves after `ms` milliseconds, or at once, with its timer cleared, when `cancel` aborts. */
  wait(ms: number, cancel: AbortSignal): Promise<void>;
  /** Hears a close that failed after the grace time, when nobody waits for it any more. */
  reportError(error: unknown): void;
  /** Hears that the lock was given up while a step still runs, so the caller ends the process. */
  onAbandoned(): void;
  /** Ends the runs left `running` once the engine closed, with the cause; `endStoppedRuns` by default in use. */
  endStoppedRuns(store: RunStore, clock: Clock, cause: RunFailureCause): Promise<number>;
}

/**
 * The open engine. `settle` closes the local engine, which waits for the
 * step in progress; when that takes longer than the grace time it gives the
 * lock up instead and says so through `onAbandoned`, whose caller ends the
 * process, and with it the step. Either way it then ends the runs left
 * `running` as interrupted, and counts them.
 */
export function runningEngine(input: RunningEngineInput): RunningEngine {
  const { engine, schedule } = input;
  let abandoned = false;
  return {
    url: input.url,
    token: input.token,
    health: () => schedule.health(),
    // Harness steps run in this process's own srt sandbox for now; the
    // shell's sandbox host is taken up once the harness host can use it.
    useSandboxHost: () => {},
    pauseRoutines: (paused) => schedule.pause(paused),
    followHealth: (listener) => schedule.follow(listener),
    stopScheduling: () => schedule.stop(),
    async settle(graceMs) {
      const closing = engine.close();
      closing.catch((error: unknown) => {
        // Before the grace time the race below throws it; after, only the report hears it.
        if (abandoned) input.reportError(error);
      });
      const grace = new AbortController();
      let outcome: "closed" | "late";
      try {
        outcome = await Promise.race([
          closing.then(() => "closed" as const),
          input.wait(graceMs, grace.signal).then(() => "late" as const),
        ]);
      } finally {
        // A clean close leaves no timer behind to keep the process alive.
        grace.abort();
      }
      if (outcome === "late") {
        abandoned = true;
        await engine.abandon();
        input.onAbandoned();
      }
      return await input.endStoppedRuns(engine.runs, engine.clock, engineStoppedCause);
    },
    async close() {
      try {
        await input.listener.close();
      } finally {
        // An abandoned close still waits for its step; the lock is already given up.
        if (!abandoned) await engine.close();
      }
    },
  };
}
