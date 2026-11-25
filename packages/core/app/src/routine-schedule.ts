// Whether an engine's routine scheduler ticks, whether its routines are
// paused, and the health it reports: the desktop engine role
// (`agent-host.engine-routine-pause`) and `halonic serve` (`server.routines`)
// share it, so a pause skips the times due the same way in both.
import type { RunStore } from "@halonicjs/ports";
import { CronError, nextRun, type PlacedRoutine } from "@halonicjs/routines";

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

/** The routines' health, as the engine role's `health` frame and the server's health route give it. */
export interface RoutineHealth {
  /** Whether the routine scheduler ticks; `false` once a stop began. */
  readonly scheduling: boolean;
  /** Whether routines are paused, or not resumed yet since the engine opened. */
  readonly paused: boolean;
  /** The runs that are going now (running or waiting). */
  readonly activeRuns: number;
  /** Of `activeRuns`, the ones waiting for someone's answer. */
  readonly runsWaiting: number;
  /** When the scheduler last ticked, as an ISO time, or `null` before its first tick. */
  readonly lastTick: string | null;
  /** When the next routine is due to start on its own, as an ISO time, or `null`. */
  readonly nextRoutineAt: string | null;
}

/**
 * Whether the routine scheduler ticks, whether routines are paused, when it
 * last ticked, how many runs are going and when the next routine is due, for
 * the engine's health. Made before the engine opens, as the engine's
 * `routines` option needs it.
 */
export class EngineSchedule {
  #scheduling = true;
  /** The newest {@link pause}, `null` until the first. */
  #paused: boolean | null = null;
  #lastTick: string | null = null;
  #runs: RunCounts = { active: 0, waiting: 0 };
  #nextRoutineAt: string | null = null;
  readonly #listeners = new Set<() => void>();

  /** The health now. */
  health(): RoutineHealth {
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
   * before the first {@link pause}, does nothing; one while paused passes, so
   * the times due during the pause are skipped, not caught up after it. After
   * each tick, paused or not, it counts the runs that are going, as a run
   * started by hand goes on while routines are paused; after a tick that
   * wasn't paused it also reads when the next routine is due.
   */
  ticks(
    scheduler: TickingScheduler,
    readings: TickReadings,
  ): { onTick(at: string): Promise<void>; dispose(): Promise<void> } {
    return {
      onTick: async (at) => {
        // Before the first word nothing is stored either: if it says resume,
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

/**
 * The readings after each tick from the engine's run store and the routines
 * the scheduler reads.
 *
 * @param timeZone the zone for schedules that name none, as the scheduler's tick policy has it
 */
export function routineTickReadings(
  runs: Pick<RunStore, "list">,
  routines: () => Promise<readonly PlacedRoutine[]>,
  timeZone: string,
): TickReadings {
  return {
    countRuns: async () => {
      const going = await runs.list({ status: ["running", "waiting"] });
      const waiting = going.filter((run) => run.status === "waiting").length;
      return { active: going.length, waiting };
    },
    nextRoutineAt: async (at) => nextRoutineAt(await routines(), new Date(at), timeZone),
  };
}

/**
 * When the first of `routines` is due to start on its own after `after`, as
 * an ISO time, or `null` when none is: the same next run the Routines list
 * shows (HAL-18279). A routine that is off, has no clock (manual, signal,
 * mail and webhook triggers) or whose schedule doesn't parse has no next
 * start; the scheduler skips a broken one too, so it doesn't hide the others.
 *
 * @param timeZone the zone for schedules that name none, as the scheduler's tick policy has it
 */
export function nextRoutineAt(
  routines: readonly PlacedRoutine[],
  after: Date,
  timeZone: string,
): string | null {
  let earliest: Date | null = null;
  for (const { routine } of routines) {
    if (!routine.enabled) continue;
    const next = nextStart(routine.trigger, after, timeZone);
    if (next !== null && (earliest === null || next < earliest)) earliest = next;
  }
  return earliest?.toISOString() ?? null;
}

function nextStart(
  trigger: PlacedRoutine["routine"]["trigger"],
  after: Date,
  timeZone: string,
): Date | null {
  try {
    return nextRun(trigger, after, timeZone);
  } catch (error) {
    if (error instanceof CronError) return null;
    throw error;
  }
}
