// Sending an event to a waiting run, for `halonic runs send`, `halonic run
// --event` and the Studio's approve button (C174 on HAL-2000, C224 on
// HAL-2588). The "only while waiting" rule lives here, so every surface
// refuses the same sends for the same reasons.

import { type RunSummary, summarize } from "@halonicjs/events";
import type { RunExecutor, RunStore } from "@halonicjs/ports";
import { type ErrorKind, KindedError } from "@halonicjs/std";

/**
 * Why a send was refused, with what a surface needs to say so in its own
 * words: the command line picks a `runs` catalogue sentence by `reason`.
 */
export type RunEventRefusal =
  /** No run has this id. */
  | { reason: "no-run" }
  /** The run exists but isn't waiting: it has ended or is still running. */
  | { reason: "not-waiting"; run: RunSummary }
  /** The run waits, at the step `step`, but not for this event; it takes `accepts`. */
  | { reason: "event-not-taken"; step: string; accepts: string[] };

const kindOfRefusal: Record<RunEventRefusal["reason"], ErrorKind> = {
  "no-run": "not_found",
  "not-waiting": "conflict",
  "event-not-taken": "invalid_input",
};

/**
 * A send that {@link RunEvents.sendEvent} refused. Its kind gives the exit
 * code (`not_found`, `conflict` or `invalid_input`); `refusal` says why. The
 * message is for the log: surfaces build their own sentence from `refusal`.
 */
export class RunEventRefused extends KindedError {
  readonly refusal: RunEventRefusal;

  constructor(runId: string, event: string, refusal: RunEventRefusal, cause?: unknown) {
    super(
      kindOfRefusal[refusal.reason],
      `Run "${runId}" doesn't take "${event}" now (${refusal.reason}).`,
      cause === undefined ? {} : { cause },
    );
    this.refusal = refusal;
  }
}

/**
 * The engine's own refusal codes for a send (`InputRefused` in `core/engine`,
 * which this package can't import). A remote executor passes the code on.
 */
const engineRefusalCodes: readonly string[] = [
  "engine.run-unknown",
  "engine.run-ended",
  "engine.input-not-accepted",
];

function isEngineRefusal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    engineRefusalCodes.includes(error.code)
  );
}

/**
 * Why a run as `summary` tells it can't take `event`, or `null` when it can.
 * A run that waits on a subflow passes the event on to it, so only the
 * engine knows whether it is taken.
 */
function refusalOf(summary: RunSummary | null, event: string): RunEventRefusal | null {
  if (summary === null) {
    return { reason: "no-run" };
  }
  if (summary.status !== "waiting") {
    return { reason: "not-waiting", run: summary };
  }
  if (summary.waitingOn === null && !summary.accepts.includes(event)) {
    return eventNotTaken(summary);
  }
  return null;
}

function eventNotTaken(summary: RunSummary): RunEventRefusal {
  return { reason: "event-not-taken", step: summary.state ?? "", accepts: [...summary.accepts] };
}

/** Sends events to a workspace's waiting runs, through its {@link RunExecutor}. */
export class RunEvents {
  readonly #executor: Pick<RunExecutor, "send">;
  readonly #runs: Pick<RunStore, "events">;

  constructor(executor: Pick<RunExecutor, "send">, runs: Pick<RunStore, "events">) {
    this.#executor = executor;
    this.#runs = runs;
  }

  /**
   * Sends `event` to a waiting run (requirement `app.run-send`). It names no
   * call, so the engine answers the oldest waiting item (C224). The summary
   * it returns may still say "running": follow the run with `subscribe`.
   *
   * @param runId - the run's full id; a surface that takes a short id looks
   *   it up with `RunHistory.findRun` first
   * @param event - such as "approve"
   * @throws RunEventRefused when there is no such run, the run isn't
   *   waiting, or it doesn't take this event now. A run that ends between
   *   the check and the send is refused the same way.
   *
   * @example
   * await runEvents.sendEvent("run_mfx3k2a1_a1b2c3d4", "approve");
   * // { id: "run_mfx3k2a1_a1b2c3d4", status: "running", … }
   */
  async sendEvent(runId: string, event: string): Promise<RunSummary> {
    const refusal = refusalOf(await this.#summary(runId), event);
    if (refusal !== null) {
      throw new RunEventRefused(runId, event, refusal);
    }
    try {
      return await this.#executor.send(runId, event);
    } catch (error) {
      if (!isEngineRefusal(error)) throw error;
      // The run moved on after the check. Its log now says why; a run that
      // still waits for this event refused it because no transition's
      // condition held, which reads the same as an event it doesn't take.
      const summary = await this.#summary(runId);
      const refused: RunEventRefusal =
        summary === null
          ? { reason: "no-run" }
          : (refusalOf(summary, event) ?? eventNotTaken(summary));
      throw new RunEventRefused(runId, event, refused, error);
    }
  }

  async #summary(runId: string): Promise<RunSummary | null> {
    return summarize(await this.#runs.events(runId));
  }
}
