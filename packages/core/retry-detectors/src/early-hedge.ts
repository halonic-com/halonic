import type { AttemptStep } from "./attempt-step.ts";
import { type DetectorResult, isSameSetup, type WriterSetup } from "./calibration.ts";
import { calibratedOn } from "./coefficients.ts";
import type { StartReason, StopReason } from "./decision-log.ts";
import type { EarlyHedgeConfig } from "./early-hedge-config.ts";
import { type FinishedAttempt, scoreFinishedAttempt } from "./end-of-run.ts";
import { type CheckpointMinute, checkpointMinutes, scoreRunningAttempt } from "./in-run.ts";
import type { FailScore } from "./logistic-model.ts";

/** One writer attempt, as the policy drives it. The caller runs it in its own workspace. */
export interface HedgeAttempt {
  /** The steps its event stream has shown so far (see `AttemptStepRecorder`). */
  steps(): readonly AttemptStep[];
  /** Settles once it stops by itself, with what the end-of-run detector reads. */
  readonly finished: Promise<FinishedAttempt>;
  /** Stops it and resolves once it has stopped. A stopped attempt is never shipped. */
  stop(): Promise<void>;
}

/**
 * One decision of the policy. Its fields line up with the decision log's
 * entries (`DecisionEntry`), so the caller maps one to the other directly.
 */
export type HedgeDecision =
  | {
      readonly kind: "started";
      readonly attempt: number;
      readonly atSeconds: number;
      readonly reason: StartReason;
      /** For a spawn: the attempt whose score or end started this one. */
      readonly spawnedBy?: number;
    }
  | ({
      readonly kind: "checkpoint";
      readonly attempt: number;
      readonly minute: CheckpointMinute;
      readonly atSeconds: number;
      /** The policy started another attempt because of this score. */
      readonly spawned: boolean;
      /** The policy stopped this attempt because of this score. */
      readonly stopped: boolean;
    } & FailScore)
  | {
      readonly kind: "stopped";
      readonly attempt: number;
      readonly atSeconds: number;
      readonly reason: StopReason;
    }
  | ({
      readonly kind: "finished";
      readonly attempt: number;
      readonly atSeconds: number;
    } & FailScore)
  | {
      readonly kind: "failed";
      readonly attempt: number;
      readonly atSeconds: number;
      /** Why: the writer's own error, or the end-of-run scorer's. */
      readonly error: string;
    }
  | HedgeOutcome;

/** What the writer step does with the attempts. */
export type HedgeOutcome =
  /** Ship this attempt's change: the finished, unflagged one with the lowest score. */
  | { readonly kind: "ship"; readonly attempt: number; readonly pFail: number }
  /** Ship nothing and run the writer on Opus: every attempt was flagged, stopped or failed. */
  | { readonly kind: "fallback"; readonly attempts: number };

/** What {@link runEarlyHedge} needs. */
export interface EarlyHedgeOptions {
  readonly config: EarlyHedgeConfig;
  /** The writer setup the attempts run on; it must be the one the detectors were fitted on. */
  readonly setup: WriterSetup;
  /** Starts attempt `attempt` (from 1) in a workspace of its own. */
  start(attempt: number): HedgeAttempt;
  /** Paths at the base commit, to tell edits of existing tests from new test files. */
  readonly existingFiles?: ReadonlySet<string>;
  /** Receives every decision as it is made. */
  log?(decision: HedgeDecision): void;
  /** The clock in milliseconds; `Date.now` by default. */
  now?(): number;
  /**
   * A wait of `ms` that the policy cancels once something else happened first.
   * Core has no timers of its own, so the caller passes its scheduler's.
   */
  sleep(ms: number): { readonly done: Promise<void>; cancel(): void };
  /** The in-run score at a checkpoint; the in-run detector by default. */
  scoreRunning?(steps: readonly AttemptStep[], minute: CheckpointMinute): DetectorResult;
  /** The end-of-run score; the end-of-run detector by default. */
  scoreFinished?(attempt: FinishedAttempt): DetectorResult;
}

/** One started attempt and what the policy knows about it. */
interface Tracked {
  readonly number: number;
  readonly attempt: HedgeAttempt;
  readonly startedAtMs: number;
  /** Settles when `finished` does, never rejects. */
  readonly settled: Promise<void>;
  end?:
    | { readonly kind: "finished"; readonly score: FailScore }
    | { readonly kind: "failed"; readonly error: string };
  checked: number;
  hasSuccessor: boolean;
  stopped: boolean;
}

/**
 * Runs a writer step under the early hedge (board, 23 Nov; HAL-17073):
 *
 * - It starts one attempt, and scores each running attempt with the in-run
 *   detector at minute 3, 6 and 10 of that attempt.
 * - A score above `spawnAbove` starts the next attempt next to it, once per
 *   attempt; a score above `stopAbove` also stops it. An attempt that ends
 *   flagged by the end-of-run detector, or fails, without a successor gets
 *   one too, so an attempt that ends before minute 3 is still hedged.
 * - It never starts more than `maxAttempts`, and waits for every attempt it
 *   started to end.
 * - It ships the finished, unflagged attempt with the lowest end-of-run
 *   score; with none, it falls back to Opus.
 *
 * @throws Error when the setup isn't the one the detectors were fitted on (check `hedgeApplies` first)
 */
export async function runEarlyHedge(options: EarlyHedgeOptions): Promise<HedgeOutcome> {
  if (!isSameSetup(options.setup, calibratedOn)) {
    scored({ kind: "refused", calibratedOn });
  }
  return new EarlyHedge(options).run();
}

/** One run of the policy: the attempts it started and what it knows about each. */
class EarlyHedge {
  readonly #options: EarlyHedgeOptions;
  readonly #now: () => number;
  readonly #beganAtMs: number;
  readonly #tracked: Tracked[] = [];

  constructor(options: EarlyHedgeOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#beganAtMs = this.#now();
  }

  async run(): Promise<HedgeOutcome> {
    try {
      await this.#followUntilAllEnd();
    } catch (error) {
      // No attempt may outlive the policy: stop the rest before passing the error on.
      await this.#stopAllRunning();
      throw error;
    }
    const outcome = bestFinished(this.#tracked);
    this.#log(outcome);
    return outcome;
  }

  async #followUntilAllEnd(): Promise<void> {
    this.#start({ reason: "first" });
    for (;;) {
      const running = this.#running();
      if (running.length === 0) return;
      await nextChange(running, this.#now, this.#options.sleep);
      for (const entry of running) await this.#follow(entry);
    }
  }

  #running(): Tracked[] {
    return this.#tracked.filter((entry) => entry.end === undefined && !entry.stopped);
  }

  async #stopAllRunning(): Promise<void> {
    const running = this.#running();
    for (const entry of running) entry.stopped = true;
    await Promise.allSettled(running.map((entry) => entry.attempt.stop()));
    for (const entry of running) this.#logStopped(entry, "cancelled");
  }

  /** Acts on what changed for a running attempt: its end, or a checkpoint that is due. */
  async #follow(entry: Tracked): Promise<void> {
    const at = { attempt: entry.number, atSeconds: this.#atSeconds() };
    if (entry.end?.kind === "finished") {
      this.#log({ kind: "finished", ...at, ...entry.end.score });
      if (entry.end.score.flagged) this.#startSuccessorOf(entry);
      return;
    }
    if (entry.end?.kind === "failed") {
      this.#log({ kind: "failed", ...at, error: entry.end.error });
      this.#startSuccessorOf(entry);
      return;
    }
    const minute = checkpointMinutes[entry.checked];
    if (minute === undefined || this.#now() < entry.startedAtMs + minute * 60_000) return;
    entry.checked += 1;
    const score = scored(this.#scoreRunning(entry.attempt.steps(), minute));
    const spawned = score.pFail > this.#options.config.spawnAbove && this.#maySpawnFor(entry);
    const stopped = score.pFail > this.#options.config.stopAbove;
    this.#log({ kind: "checkpoint", minute, ...at, ...score, spawned, stopped });
    if (spawned) this.#startSuccessorOf(entry);
    if (stopped) {
      entry.stopped = true;
      await entry.attempt.stop();
      this.#logStopped(entry, "score");
    }
  }

  #start(why: { readonly reason: StartReason; readonly spawnedBy?: number }): void {
    const number = this.#tracked.length + 1;
    const attempt = this.#options.start(number);
    const scoreFinished = this.#options.scoreFinished ?? scoreFinishedAttempt;
    const entry: Tracked = {
      number,
      attempt,
      startedAtMs: this.#now(),
      settled: attempt.finished.then(
        (finished) => {
          // A scorer that throws counts the attempt as failed, like a writer crash.
          entry.end = finishedEnd(() => scored(scoreFinished(finished)));
        },
        (error: unknown) => {
          entry.end = { kind: "failed", error: errorMessage(error) };
        },
      ),
      checked: 0,
      hasSuccessor: false,
      stopped: false,
    };
    this.#tracked.push(entry);
    this.#log({ kind: "started", attempt: number, atSeconds: this.#atSeconds(), ...why });
  }

  /** Whether `entry` may still get a next attempt: once, while the limit allows. */
  #maySpawnFor(entry: Tracked): boolean {
    return !entry.hasSuccessor && this.#tracked.length < this.#options.config.maxAttempts;
  }

  /** Starts the next attempt for `entry`, once, while the limit allows. */
  #startSuccessorOf(entry: Tracked): void {
    if (!this.#maySpawnFor(entry)) return;
    entry.hasSuccessor = true;
    this.#start({ reason: "spawn", spawnedBy: entry.number });
  }

  #logStopped(entry: Tracked, reason: StopReason): void {
    this.#log({ kind: "stopped", attempt: entry.number, atSeconds: this.#atSeconds(), reason });
  }

  #scoreRunning(steps: readonly AttemptStep[], minute: CheckpointMinute): DetectorResult {
    const { scoreRunning, setup, existingFiles } = this.#options;
    return scoreRunning === undefined
      ? scoreRunningAttempt(steps, minute, setup, existingFiles)
      : scoreRunning(steps, minute);
  }

  #atSeconds(): number {
    return (this.#now() - this.#beganAtMs) / 1000;
  }

  #log(decision: HedgeDecision): void {
    this.#options.log?.(decision);
  }
}

/** Waits until a running attempt ends or reaches its next checkpoint. */
async function nextChange(
  running: readonly Tracked[],
  now: () => number,
  sleep: EarlyHedgeOptions["sleep"],
): Promise<void> {
  const dueTimes = running.flatMap((entry) => {
    const minute = checkpointMinutes[entry.checked];
    return minute === undefined ? [] : [entry.startedAtMs + minute * 60_000];
  });
  const wait =
    dueTimes.length === 0 ? undefined : sleep(Math.max(0, Math.min(...dueTimes) - now()));
  try {
    await Promise.race([
      ...(wait === undefined ? [] : [wait.done]),
      ...running.map((entry) => entry.settled),
    ]);
  } finally {
    wait?.cancel();
  }
}

function bestFinished(tracked: readonly Tracked[]): HedgeOutcome {
  let best: { attempt: number; pFail: number } | undefined;
  for (const entry of tracked) {
    if (entry.stopped || entry.end?.kind !== "finished" || entry.end.score.flagged) continue;
    if (best === undefined || entry.end.score.pFail < best.pFail) {
      best = { attempt: entry.number, pFail: entry.end.score.pFail };
    }
  }
  return best === undefined
    ? { kind: "fallback", attempts: tracked.length }
    : { kind: "ship", ...best };
}

function finishedEnd(score: () => FailScore): NonNullable<Tracked["end"]> {
  try {
    return { kind: "finished", score: score() };
  } catch (error) {
    return { kind: "failed", error: errorMessage(error) };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function scored(result: DetectorResult): FailScore {
  if (result.kind === "refused") {
    const { agent, model, provider } = result.calibratedOn;
    throw new Error(`The early hedge runs only on ${agent} with ${model} from ${provider}.`);
  }
  return { pFail: result.pFail, flagged: result.flagged };
}
