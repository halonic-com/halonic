// The open engine as the engine role sees it (`RunningEngine`): the shared
// local engine, its routine scheduler and its listener, with the health the
// role reports and the stop order of `agent-host.engine-role-lifecycle`.
// The Node parts are opened in `open-engine.ts`; this file only holds the
// state and the order, so a test can drive it with fakes.
import type { RunFailureCause } from "@halonicjs/events";
import type { Clock, RunStore } from "@halonicjs/ports";
import type { EngineHealth, RunningEngine } from "./engine-role.ts";

/** Why the engine role ended a run whose step didn't end within the grace time. */
export const engineStoppedCause: RunFailureCause = {
  kind: "unavailable",
  code: "engine.stopped",
};

/** The routine scheduler, as `workspaceRoutineScheduler` makes it. */
export interface TickingScheduler {
  tick(): Promise<unknown>;
  dispose(): Promise<void>;
}

/**
 * Whether the routine scheduler ticks, when it last did and how many runs
 * are going, for the role's `health` frames. Made before the engine opens,
 * as the engine's `routines` option needs it.
 */
export class EngineSchedule {
  #scheduling = true;
  #lastTick: string | null = null;
  #activeRuns = 0;
  readonly #listeners = new Set<() => void>();

  /** The health now. */
  health(): EngineHealth {
    return { scheduling: this.#scheduling, activeRuns: this.#activeRuns, lastTick: this.#lastTick };
  }

  /** Calls `listener` whenever the health changes, until the returned function is called. */
  follow(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * The engine's routine ticks on `scheduler`: a tick after {@link stop}
   * starts nothing. After each tick it counts the runs that are going.
   */
  ticks(
    scheduler: TickingScheduler,
    countActiveRuns: () => Promise<number>,
  ): { onTick(at: string): Promise<void>; dispose(): Promise<void> } {
    return {
      onTick: async (at) => {
        if (!this.#scheduling) return;
        await scheduler.tick();
        this.#lastTick = at;
        this.#activeRuns = await countActiveRuns();
        this.#changed();
      },
      dispose: () => scheduler.dispose(),
    };
  }

  /** No tick starts a run from now on. */
  stop(): void {
    if (!this.#scheduling) return;
    this.#scheduling = false;
    this.#changed();
  }

  #changed(): void {
    for (const listener of this.#listeners) listener();
  }
}

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
  /** Resolves after `ms` milliseconds. */
  wait(ms: number): Promise<void>;
  /** Ends the runs left `running` once the engine closed, with the cause; `endStoppedRuns` by default in use. */
  endStoppedRuns(store: RunStore, clock: Clock, cause: RunFailureCause): Promise<number>;
}

/**
 * The open engine. `settle` closes the local engine, which waits for the
 * step in progress; when that takes longer than the grace time it gives the
 * lock up instead, as the process exits straight after. Either way it then
 * ends the runs left `running` as interrupted, and counts them.
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
    followHealth: (listener) => schedule.follow(listener),
    stopScheduling: () => schedule.stop(),
    async settle(graceMs) {
      const closing = engine.close();
      // A close that fails after the grace time has nobody left to tell.
      closing.catch(() => undefined);
      const outcome = await Promise.race([
        closing.then(() => "closed" as const),
        input.wait(graceMs).then(() => "late" as const),
      ]);
      if (outcome === "late") {
        abandoned = true;
        await engine.abandon();
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
