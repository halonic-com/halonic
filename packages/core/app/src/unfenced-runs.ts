// Whether plugin and integration code may run without the sandbox on this
// computer, from its fence status and the user's saved yes (the "Runs" line
// design on HAL-1873, section 7, and Julian's build conditions in section
// 11; I5 design 4.3.1 on HAL-958). One yes covers every plugin and
// integration, and holds only for the reason it was given for.

import type { Clock, UnfencedRunConsent, UnfencedRunConsentStore } from "@halonicjs/ports";
import type { RunnerFence, RunnerUnfencedReason } from "./runner-fence.ts";
import type { SaveTimers } from "./save-scheduler.ts";

/**
 * How often a run without the sandbox reads the saved yes again, in
 * milliseconds. A Take back in another process (the CLI, or a second
 * Studio) stops this process's runs within about this long.
 */
export const savedYesCheckMs = 1000;

/**
 * How long Take back waits for one run without the sandbox to stop, in
 * milliseconds, before it reports that run as not stopped. A stop that never
 * returns so can't keep the toast from showing.
 */
export const stopTimeLimitMs = 10_000;

/**
 * What a start, or the trust check, may do now.
 *
 * - `fenced`: the code runs in the sandbox; no yes is needed.
 * - `allowed`: it runs without the sandbox, with the yes the user gave on
 *   `allowedAt` for this reason. The trust check shows that date (R6).
 * - `needs-yes`: it can't run until the user ticks the trust check's box
 *   for `reason`. `error` is the store's error when the saved yes couldn't
 *   be read, for the host to log; never show it to the model.
 * - `stopped`: the fence failed after the computer passed the sandbox
 *   check. It never runs without the sandbox then.
 */
export type UnfencedRunDecision =
  | { readonly run: "fenced" }
  | { readonly run: "allowed"; readonly reason: RunnerUnfencedReason; readonly allowedAt: string }
  | { readonly run: "needs-yes"; readonly reason: RunnerUnfencedReason; readonly error?: unknown }
  | { readonly run: "stopped" };

/** Stops code that runs without the sandbox, straight away. */
export type StopUnfencedRun = () => Promise<void>;

/**
 * The yes a run without the sandbox started under: its reason, and when the
 * user gave it. A yes taken back and given again for the same reason has
 * another `allowedAt`, so it is another yes.
 */
export interface UnfencedRunYes {
  readonly reason: RunnerUnfencedReason;
  readonly allowedAt: string;
}

/** Whether `saved` is still the yes `yes` was given as: same reason, same time. */
export function isSameYes(yes: UnfencedRunYes, saved: UnfencedRunConsent | null): boolean {
  return saved !== null && saved.reason === yes.reason && saved.allowedAt === yes.allowedAt;
}

/** A registered run without the sandbox, and the yes it started under. */
interface UnfencedRun {
  readonly yes: UnfencedRunYes;
  readonly stop: StopUnfencedRun;
}

/** What {@link UnfencedRuns} needs from the host. */
export interface UnfencedRunsOptions {
  /** The saved yes, in the user's profile on this computer. */
  readonly store: UnfencedRunConsentStore;
  /** Gives the time the user said yes. */
  readonly clock: Clock;
  /**
   * What the saved yes is read again with while runs without the sandbox
   * are running: `setTimeout` and `clearTimeout`, or a test's own.
   */
  readonly timers: SaveTimers;
}

/**
 * Decides whether plugin and integration code may run without the sandbox,
 * and keeps the user's yes. Only Studio calls {@link UnfencedRuns.allow}
 * and {@link UnfencedRuns.takeBack}, when the user ticks the trust check's
 * box or takes it back in Settings › Agent sandbox; there is no CLI flag,
 * and no tool the model can call reaches them.
 *
 * Halonic asks again when the reason changes, when the computer passed the
 * sandbox check since the yes, and after Take back: a yes for "inside a
 * container" doesn't cover "bubblewrap isn't installed".
 *
 * The yes is saved in the profile, so every process on this computer shares
 * it, but each process keeps its own runs. While runs are registered, this
 * process reads the saved yes again every {@link savedYesCheckMs} and stops
 * each run whose yes is gone, unreadable, for another reason or given again
 * since. That is how a Take back in Studio reaches a CLI runner too.
 *
 * @example
 * const runs = new UnfencedRuns({ store, clock, timers });
 * const decision = await runs.decide(runnerFence({ platform, check: await sandbox.check() }));
 * if (decision.run === "allowed") {
 *   const unregister = runs.registerUnfencedRun(decision, () => connection.stop());
 * }
 */
export class UnfencedRuns {
  readonly #store: UnfencedRunConsentStore;
  readonly #clock: Clock;
  readonly #timers: SaveTimers;
  readonly #running = new Set<UnfencedRun>();
  /** Stops in progress, so a run is never stopped twice at once. */
  readonly #stopping = new Map<UnfencedRun, Promise<void>>();
  /** Starts that may start code without the sandbox and haven't finished yet. */
  readonly #starting = new Set<Promise<unknown>>();
  /** The timer of the next read of the saved yes, while runs are registered. */
  #nextCheck: unknown;

  constructor(options: UnfencedRunsOptions) {
    this.#store = options.store;
    this.#clock = options.clock;
    this.#timers = options.timers;
  }

  /**
   * What the code may do with the fence status now. Ask it when the trust
   * check opens and again before every start, with the status at that
   * moment: what the dialog showed never decides a start (Julian's
   * condition (a)).
   *
   * When the computer is in the sandbox, the saved yes is removed, so a
   * later failure asks again even for the same reason. Call it at start-up
   * too, so a pass is seen even when nothing starts.
   *
   * @throws the store's error when a saved yes can't be removed after the computer passed
   */
  async decide(fence: RunnerFence): Promise<UnfencedRunDecision> {
    switch (fence.state) {
      case "fenced":
        await this.#store.remove();
        return { run: "fenced" };
      case "stopped":
        return { run: "stopped" };
      case "not-fenced":
        return this.#decideWithoutFence(fence.reason);
    }
  }

  /**
   * Saves the user's yes for `reason`, replacing any yes for another reason.
   * Only for the trust check's box, ticked by the user in Studio.
   */
  async allow(reason: RunnerUnfencedReason): Promise<void> {
    await this.#store.save({ reason, allowedAt: this.#clock.now().toISOString() });
  }

  /**
   * Takes the yes back and stops every plugin and integration that runs
   * without the sandbox in this process, before it returns, so the toast
   * "Taken back" is true. A start that is still in progress is waited for:
   * it sees the yes is gone and stops what it started. Halonic asks again
   * the next time one starts.
   *
   * Runs in other processes stop within {@link savedYesCheckMs}, when they
   * next read the saved yes.
   *
   * @throws an `AggregateError` when one or more could not be stopped, or
   *   didn't stop within {@link stopTimeLimitMs}; the others are still
   *   stopped, and the yes is gone either way
   */
  async takeBack(): Promise<void> {
    await this.#store.remove();
    // Every start that could still have read the yes registered before it
    // read it, so it is in this list now. Its own errors are its caller's.
    await Promise.allSettled([...this.#starting]);
    const runs = [...this.#running];
    const results = await Promise.allSettled(runs.map((run) => this.#stopWithinTimeLimit(run)));
    const failed = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason as unknown] : [],
    );
    if (failed.length > 0) {
      throw new AggregateError(
        failed,
        `${failed.length} of ${runs.length} plugins and integrations without the sandbox didn't stop.`,
      );
    }
  }

  /**
   * Runs `start`, a start that may run code without the sandbox, so that
   * {@link UnfencedRuns.takeBack} waits for it. `start` must decide with
   * {@link UnfencedRuns.decide} again once its code runs, and stop it when
   * the yes is gone.
   */
  async whileStarting<Result>(start: () => Promise<Result>): Promise<Result> {
    // Added before `start` reads the yes, so a Take back after that read waits for it.
    const started = start();
    this.#starting.add(started);
    try {
      return await started;
    } finally {
      this.#starting.delete(started);
    }
  }

  /**
   * Registers code that has started without the sandbox under `yes`, the
   * allowed decision it started with, so {@link UnfencedRuns.takeBack} can
   * stop it, and so it stops when that yes is no longer the saved one. Call
   * the returned function when it stops by itself.
   */
  registerUnfencedRun(yes: UnfencedRunYes, stop: StopUnfencedRun): () => void {
    const run: UnfencedRun = { yes: { reason: yes.reason, allowedAt: yes.allowedAt }, stop };
    this.#running.add(run);
    this.#checkSavedYesLater();
    return () => this.#forget(run);
  }

  #forget(run: UnfencedRun): void {
    this.#running.delete(run);
    if (this.#running.size === 0) this.#stopCheckingSavedYes();
  }

  /**
   * Stops `run`, or joins its stop already in progress. The run stays
   * registered until its stop resolves, so a stop that fails is tried again.
   */
  #stop(run: UnfencedRun): Promise<void> {
    const inProgress = this.#stopping.get(run);
    if (inProgress !== undefined) return inProgress;
    const stopping = (async () => {
      try {
        await run.stop();
        this.#forget(run);
      } finally {
        this.#stopping.delete(run);
      }
    })();
    this.#stopping.set(run, stopping);
    return stopping;
  }

  /** Stops `run`, and rejects when it hasn't stopped within {@link stopTimeLimitMs}. */
  async #stopWithinTimeLimit(run: UnfencedRun): Promise<void> {
    let timer: unknown;
    const tooLate = new Promise<never>((_resolve, reject) => {
      timer = this.#timers.set(
        () => reject(new Error(`didn't stop within ${stopTimeLimitMs / 1000} seconds`)),
        stopTimeLimitMs,
      );
    });
    try {
      await Promise.race([this.#stop(run), tooLate]);
    } finally {
      this.#timers.clear(timer);
    }
  }

  #checkSavedYesLater(): void {
    if (this.#nextCheck !== undefined) return;
    this.#nextCheck = this.#timers.set(() => {
      this.#nextCheck = undefined;
      void this.#checkSavedYes();
    }, savedYesCheckMs);
  }

  #stopCheckingSavedYes(): void {
    if (this.#nextCheck === undefined) return;
    this.#timers.clear(this.#nextCheck);
    this.#nextCheck = undefined;
  }

  /**
   * Stops every run whose yes is no longer the saved one. The next check is
   * scheduled without waiting for the stops, so a stop that never returns
   * doesn't end the checks for the other runs. A run that fails to stop
   * stays registered, so the next check tries again.
   */
  async #checkSavedYes(): Promise<void> {
    const saved = await this.#savedYes();
    for (const run of this.#running) {
      if (isSameYes(run.yes, saved)) continue;
      // Its error is dealt with by trying again at the next check.
      this.#stop(run).catch(() => undefined);
    }
    if (this.#running.size > 0) this.#checkSavedYesLater();
  }

  /** The saved yes, or `null` when there is none or it can't be read. */
  async #savedYes(): Promise<UnfencedRunConsent | null> {
    try {
      return await this.#store.get();
    } catch {
      return null;
    }
  }

  async #decideWithoutFence(reason: RunnerUnfencedReason): Promise<UnfencedRunDecision> {
    let saved: Awaited<ReturnType<UnfencedRunConsentStore["get"]>>;
    try {
      saved = await this.#store.get();
    } catch (error) {
      return { run: "needs-yes", reason, error };
    }
    if (saved === null || saved.reason !== reason) {
      return { run: "needs-yes", reason };
    }
    return { run: "allowed", reason, allowedAt: saved.allowedAt };
  }
}
