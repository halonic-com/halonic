// The effects of a step whose events are stored but that couldn't all be
// carried out, because the scheduler or the store failed (HAL-5214). Left
// alone, the run would wait with no timer to move it on: the timer whose
// delivery failed comes again, but the run no longer waits on what it named.
// So they are kept here and carried out on the run's next timer.

import type { RunStore, Scheduler } from "@halonicjs/ports";
import type { Effect } from "../kernel/decide-types.ts";
import { hasEnded, type RunState } from "../kernel/run-state.ts";
import { readRun } from "../kernel/step.ts";

/**
 * The id of the timer set for a run with kept effects. A step that no timer
 * delivered, such as a start or a send, has no timer that comes again.
 */
export const resumeTimer = "resume";

/** What {@link UnfinishedEffects} needs from the local runs. */
export interface UnfinishedEffectsOptions {
  readonly store: Pick<RunStore, "events" | "snapshot">;
  readonly scheduler: Scheduler;
  /** Carries out one effect of a step of `run`. */
  carryOut(run: RunState, effect: Effect): Promise<void>;
  /** A run has just ended, and its step's effects are all carried out. */
  ended(runId: string): Promise<void>;
  /** The time now, as an ISO string. */
  now(): string;
}

/** The effects of one step that are still to be carried out, and the run as that step left it. */
interface KeptEffects {
  readonly run: RunState;
  readonly effects: readonly Effect[];
}

/** Where carrying out a step stopped: what of it is still to do, and the error. */
interface Stopped {
  readonly left: KeptEffects;
  readonly error: unknown;
}

/** Carries out a step's effects in order, and keeps those it couldn't for the run's next timer. */
export class UnfinishedEffects {
  readonly #options: UnfinishedEffectsOptions;
  /** The kept effects of each run, oldest step first. Lost with the process, as the run's harness calls are. */
  readonly #kept = new Map<string, KeptEffects[]>();

  constructor(options: UnfinishedEffectsOptions) {
    this.#options = options;
  }

  /**
   * Carries out the effects of a step of `run`, in order. When one throws,
   * it and those after it are kept, a `resume` timer is set for the run, and
   * the error goes to the caller.
   */
  async carryOut(run: RunState, effects: readonly Effect[]): Promise<void> {
    const stopped = await this.#carryOutUntilError({ run, effects });
    if (stopped === undefined) return;
    this.#kept.set(run.runId, [...(this.#kept.get(run.runId) ?? []), stopped.left]);
    await this.#setResumeTimer(run.runId);
    throw stopped.error;
  }

  /**
   * Carries out the effects a run kept, oldest step first. Those of a step
   * that left the run going are dropped once the run has ended, by a cancel
   * say: what they started would run on under an ended run.
   */
  async resume(runId: string): Promise<void> {
    const kept = this.#kept.get(runId);
    if (kept === undefined) return;
    this.#kept.delete(runId);
    for (const [index, step] of kept.entries()) {
      const stopped = await this.#resumeStep(runId, step);
      if (stopped === undefined) continue;
      // Ahead of any a delivery kept meanwhile: theirs come from later steps.
      const later = this.#kept.get(runId) ?? [];
      this.#kept.set(runId, [stopped.left, ...kept.slice(index + 1), ...later]);
      await this.#setResumeTimer(runId);
      throw stopped.error;
    }
  }

  /** @returns where it stopped, when reading the run, an effect or ending the run threw */
  async #resumeStep(runId: string, step: KeptEffects): Promise<Stopped | undefined> {
    const endedByStep = hasEnded(step.run.status);
    let left = step;
    try {
      const now = await readRun(this.#options.store, runId);
      if (now === null || (hasEnded(now.status) && !endedByStep)) return undefined;
      const stopped = await this.#carryOutUntilError(step);
      if (stopped !== undefined) return stopped;
      // Its effects are carried out: kept again from here, only the end is left.
      left = { run: step.run, effects: [] };
      if (endedByStep) await this.#options.ended(runId);
      return undefined;
    } catch (error) {
      return { left, error };
    }
  }

  /** @returns where it stopped, when an effect threw */
  async #carryOutUntilError(step: KeptEffects): Promise<Stopped | undefined> {
    for (const [index, effect] of step.effects.entries()) {
      try {
        await this.#options.carryOut(step.run, effect);
      } catch (error) {
        return { left: { run: step.run, effects: step.effects.slice(index) }, error };
      }
    }
    return undefined;
  }

  async #setResumeTimer(runId: string): Promise<void> {
    const { scheduler, now } = this.#options;
    try {
      await scheduler.schedule(runId, resumeTimer, now());
    } catch {
      // The caller gets the error that kept the effects. A scheduler that
      // can't set this timer either delivers the timer that failed again,
      // and any timer of the run carries out what it kept.
    }
  }
}
