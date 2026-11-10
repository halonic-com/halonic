// Whether plugin and integration code may run without the sandbox on this
// computer, from its fence status and the user's saved yes (the "Runs" line
// design on HAL-1873, section 7, and Julian's build conditions in section
// 11; I5 design 4.3.1 on HAL-958). One yes covers every plugin and
// integration, and holds only for the reason it was given for.

import type { Clock, UnfencedRunConsentStore } from "@halonicjs/ports";
import type { RunnerFence, RunnerUnfencedReason } from "./runner-fence.ts";

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

/** What {@link UnfencedRuns} needs from the host. */
export interface UnfencedRunsOptions {
  /** The saved yes, in the user's profile on this computer. */
  readonly store: UnfencedRunConsentStore;
  /** Gives the time the user said yes. */
  readonly clock: Clock;
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
 * @example
 * const runs = new UnfencedRuns({ store, clock });
 * const decision = await runs.decide(runnerFence({ platform, check: await sandbox.check() }));
 * if (decision.run === "allowed") {
 *   const unregister = runs.registerUnfencedRun(() => connection.stop());
 * }
 */
export class UnfencedRuns {
  readonly #store: UnfencedRunConsentStore;
  readonly #clock: Clock;
  readonly #running = new Set<StopUnfencedRun>();

  constructor(options: UnfencedRunsOptions) {
    this.#store = options.store;
    this.#clock = options.clock;
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
   * without the sandbox, before it returns, so the toast "Taken back" is
   * true. Halonic asks again the next time one starts.
   *
   * @throws an `AggregateError` when one or more could not be stopped; the
   *   others are still stopped, and the yes is gone either way
   */
  async takeBack(): Promise<void> {
    await this.#store.remove();
    const stops = [...this.#running];
    const results = await Promise.allSettled(stops.map((stop) => stop()));
    const failed = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason as unknown] : [],
    );
    if (failed.length > 0) {
      throw new AggregateError(
        failed,
        `${failed.length} of ${stops.length} plugins and integrations without the sandbox didn't stop.`,
      );
    }
  }

  /**
   * Registers code that has started without the sandbox, so
   * {@link UnfencedRuns.takeBack} can stop it. Call the returned function
   * when it stops by itself.
   */
  registerUnfencedRun(stop: StopUnfencedRun): () => void {
    this.#running.add(stop);
    return () => {
      this.#running.delete(stop);
    };
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
