// Sending an event to a waiting run, for `halonic runs send`, `halonic run
// --event` and the Studio's approve button (C174 on HAL-2000, C224 on
// HAL-2588). The "only while waiting" rule lives here, so every surface
// refuses the same sends for the same reasons.

import { type RunEvent, type RunSummary, summarize } from "@halonicjs/events";
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
  | { reason: "event-not-taken"; step: string; accepts: string[] }
  /** The approval the send was for was answered first; the run may wait on another one now. */
  | { reason: "answered"; run: RunSummary }
  /** The run never asked for the approval of the call the send named, `callId`. */
  | { reason: "no-call"; callId: string };

const kindOfRefusal: Record<RunEventRefusal["reason"], ErrorKind> = {
  "no-run": "not_found",
  "not-waiting": "conflict",
  "event-not-taken": "invalid_input",
  answered: "conflict",
  "no-call": "not_found",
};

/**
 * Which approval a send answers: the oldest one a run's summary lists, as a
 * surface showed it to the person, or the one the person named by its call
 * id, such as with `halonic runs send --call`.
 */
export type SendFor = Pick<RunSummary, "approvals"> | { readonly callId: string };

/** The call `sendFor` names, or `undefined` for a send that names none. */
function callOf(sendFor: SendFor | undefined): string | undefined {
  if (sendFor === undefined) return undefined;
  return "callId" in sendFor ? sendFor.callId : sendFor.approvals[0]?.callId;
}

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
  "engine.decision-callid-must-match",
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

/**
 * The refusal of a send for the approval of `callId`: `no-call` when the run
 * never asked for it, `answered` when it doesn't wait on it any more.
 */
function callRefusal(
  events: readonly RunEvent[],
  summary: RunSummary,
  callId: string | undefined,
): RunEventRefusal | null {
  if (callId === undefined) return null;
  if (summary.approvals.some((approval) => approval.callId === callId)) return null;
  const asked = events.some(
    (event) => event.type === "approval.requested" && event.callId === callId,
  );
  return asked ? { reason: "answered", run: summary } : { reason: "no-call", callId };
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
   * Sends `event` to a waiting run (requirement `app.run-send`). Without
   * `sendFor`, it names no call, so the engine answers the oldest waiting
   * item (C224). With the run's summary a surface showed the person, it
   * names the oldest approval that summary lists, so a send that comes late
   * doesn't answer the approval that waits after it (requirement
   * `app.run-send-seen-approval`). With a call id the person named, it
   * answers only that approval (requirement `app.run-send-named-call`). The
   * summary it returns may still say "running": follow the run with
   * `subscribe`.
   *
   * @param runId - the run's full id; a surface that takes a short id looks
   *   it up with `RunHistory.findRun` first
   * @param event - such as "approve"
   * @param sendFor - the run's summary as the person saw it when they chose
   *   `event`, or the call id they named
   * @param payload - data that goes with the event, which the waiting step
   *   writes to the run's context (requirement `app.run-send-payload`)
   * @throws RunEventRefused when there is no such run, the run isn't
   *   waiting, it doesn't take this event now, the approval `sendFor` names
   *   was answered first, or the run never asked for it. A run that ends
   *   between the check and the send is refused the same way.
   *
   * @example
   * await runEvents.sendEvent("run_mfx3k2a1_a1b2c3d4", "approve", { callId: "call-2" });
   * // { id: "run_mfx3k2a1_a1b2c3d4", status: "running", … }
   */
  async sendEvent(
    runId: string,
    event: string,
    sendFor?: SendFor,
    payload?: unknown,
  ): Promise<RunSummary> {
    const callId = callOf(sendFor);
    const { refusal } = await this.#check(runId, event, callId);
    if (refusal !== null) {
      throw new RunEventRefused(runId, event, refusal);
    }
    try {
      return await this.#executor.send(
        runId,
        event,
        payload,
        callId === undefined ? undefined : { callId },
      );
    } catch (error) {
      if (!isEngineRefusal(error)) throw error;
      throw new RunEventRefused(runId, event, await this.#movedOn(runId, event, callId), error);
    }
  }

  /**
   * Why the engine refused a send that passed the check: the run moved on
   * after it. Its log now says why; a run that still waits for this event
   * refused it because no transition's condition held, which reads the same
   * as an event it doesn't take.
   */
  async #movedOn(
    runId: string,
    event: string,
    callId: string | undefined,
  ): Promise<RunEventRefusal> {
    const { summary, refusal } = await this.#check(runId, event, callId);
    if (refusal !== null) return refusal;
    // A run that passes the check has a summary.
    return summary === null ? { reason: "no-run" } : eventNotTaken(summary);
  }

  /** The run as its log tells it now, and why it can't take the send, or `null` when it can. */
  async #check(
    runId: string,
    event: string,
    callId: string | undefined,
  ): Promise<{ summary: RunSummary | null; refusal: RunEventRefusal | null }> {
    const events = await this.#runs.events(runId);
    const summary = summarize(events);
    const refusal =
      refusalOf(summary, event) ?? (summary === null ? null : callRefusal(events, summary, callId));
    return { summary, refusal };
  }
}
