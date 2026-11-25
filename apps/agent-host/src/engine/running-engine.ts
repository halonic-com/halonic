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
  /**
   * A tick that starts nothing and moves the last tick to now, recording the times it skipped.
   * A last tick ahead of now (the clock was set back) stays; the scheduler's first tick after the
   * resume fixes it.
   */
  pass(): Promise<unknown>;
  dispose(): Promise<void>;
}

/** The runs going now, and how many of them wait for someone's answer. */
export interface RunCounts {
  readonly active: number;
  readonly waiting: number;
}

/** What the schedule reads after a tick, for the health. */
export interface TickReadings {
  /** The runs going now (running or waiting), and how many of them wait. */
  countRuns(): Promise<RunCounts>;
  /** When the next routine is due to start after `at`, as an ISO time, or `null` when none is. */
  nextRoutineAt(at: string): Promise<string | null>;
}

/**
 * Whether the routine scheduler ticks, whether routines are paused, when it
 * last ticked, how many runs are going and when the next routine is due, for
 * the role's `health` frames. Made before the engine opens, as the engine's
 * `routines` option needs it.
 */
export class EngineSchedule {
  #scheduling = true;
  /** The shell's newest `pause_routines`, `null` until its first. */
  #paused: boolean | null = null;
  #lastTick: string | null = null;
  #runs: RunCounts = { active: 0, waiting: 0 };
  #nextRoutineAt: string | null = null;
  readonly #listeners = new Set<() => void>();

  /** The health now. */
  health(): EngineHealth {
    return {
      scheduling: this.#scheduling,
      paused: this.#paused !== false,
      activeRuns: this.#runs.active,
      runsWaiting: this.#runs.waiting,
      lastTick: this.#lastTick,
      nextRoutineAt: this.#nextRoutineAt,
    };
  }

  /** Calls `listener` whenever the health changes, until the returned function is called. */
  follow(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * The engine's routine ticks on `scheduler`: a tick after {@link stop}, or
   * before the shell's first `pause_routines`, does nothing; one while paused
   * passes, so the times due during the pause are skipped, not caught up after
   * it. After each tick, paused or not, it counts the runs that are going, as
   * a run started by hand goes on while routines are paused; after a tick that
   * wasn't paused it also reads when the next routine is due.
   */
  ticks(
    scheduler: TickingScheduler,
    readings: TickReadings,
  ): { onTick(at: string): Promise<void>; dispose(): Promise<void> } {
    return {
      onTick: async (at) => {
        // Before the shell's word nothing is stored either: if it says resume,
        // the times due since the last tick are caught up as after any start.
        if (!this.#scheduling || this.#paused === null) return;
        const before = JSON.stringify(this.health());
        if (this.#paused) {
          await scheduler.pass();
        } else {
          await scheduler.tick();
          this.#lastTick = at;
          this.#nextRoutineAt = await readings.nextRoutineAt(at);
        }
        this.#runs = await readings.countRuns();
        // A pause or a stop while the tick ran wins over what it read.
        if (this.#paused || !this.#scheduling) this.#nextRoutineAt = null;
        if (JSON.stringify(this.health()) !== before) this.#changed();
      },
      dispose: () => scheduler.dispose(),
    };
  }

  /** Pauses routines, or resumes them, from the next tick on. */
  pause(paused: boolean): void {
    // Before the first one the health already says paused.
    const wasPaused = this.#paused !== false;
    this.#paused = paused;
    // No routine is due while paused; the first tick after the resume reads it again.
    if (paused) this.#nextRoutineAt = null;
    if (paused !== wasPaused) this.#changed();
  }

  /** No tick starts a run from now on. */
  stop(): void {
    if (!this.#scheduling) return;
    this.#scheduling = false;
    this.#nextRoutineAt = null;
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
