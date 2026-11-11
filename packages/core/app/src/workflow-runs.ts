// Starting a workflow run and following it until it ends or waits for
// someone, for `halonic run <workflow>` and later the Studio's Run button
// (HAL-3814). It takes the `RunExecutor` port, so `app` still imports no
// engine. Sending an event to a waiting run is `RunEvents.sendEvent`; this
// service only follows the run again afterwards.

import { type RunEvent, type RunVersion, summarize } from "@halonicjs/events";
import type { RunExecutor, RunSubscription } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { hubWorkflows, lookUpWorkflow, type WorkflowLookup } from "./hub-workflows.ts";
import type { RunDetail } from "./run-history.ts";

/**
 * What starting a workflow someone named gave: the run, followed until it
 * ended or waited, or the same "none" and "several" a workflow lookup gives,
 * in which case nothing started.
 */
export type StartedRun =
  | { readonly found: "one"; readonly run: RunDetail }
  | Exclude<WorkflowLookup, { found: "one" }>;

/** Options for following a run. */
export interface FollowOptions {
  /**
   * Only an end or a wait after this `seq` stops the follow. 0, the default,
   * for a new run. To follow a run on after sending it an event, pass the
   * `lastSeq` it had before the send, so its earlier wait doesn't count.
   */
  readonly after?: number;
  /**
   * Stops following, as Ctrl C does, and cancels the run when the executor
   * can: the follow rejects with {@link RunFollowStopped}. With an executor
   * that has no `cancel`, the run itself goes on.
   */
  readonly signal?: AbortSignal;
  /**
   * Called for every event the follow reads, oldest first: the stored ones,
   * then the new ones, each before the follow decides whether it stops there
   * (requirement `app.run-follow-events`). A surface uses it to draw while
   * the run goes. It is never called once the follow has settled.
   *
   * It runs synchronously and is not awaited, so it returns nothing. If it
   * throws, the follow closes its stream and rejects with that error.
   *
   * @param event - the event just read
   * @param events - the log so far, `event` last: a read-only view that is
   *   only valid during the call, because the follow keeps adding to it. A
   *   surface that keeps it must copy it.
   */
  readonly onEvent?: (event: RunEvent, events: readonly RunEvent[]) => void;
}

/** Options for starting a run with {@link WorkflowRuns.startRun}: a follow's, and what the run read. */
export interface StartRunOptions extends Omit<FollowOptions, "after"> {
  /**
   * Which version of the workspace the run reads, recorded on its
   * `run.started`: `runVersionOf` the `RunSource` the workspace was loaded
   * from. Not recorded when absent.
   */
  readonly version?: RunVersion;
}

/** The executor calls {@link WorkflowRuns} makes; `cancel` is optional, as on the port. */
export type WorkflowRunsExecutor = Pick<RunExecutor, "start" | "subscribe" | "cancel">;

/**
 * The follow of `runId` was stopped through its signal before the run ended
 * or waited. `events` are the ones seen until then, oldest first, so a
 * surface can name the last step that ran.
 */
export class RunFollowStopped extends Error {
  override readonly name = "RunFollowStopped";
  readonly runId: string;
  readonly events: readonly RunEvent[];
  /**
   * Whether the executor cancelled the run. False when it has no `cancel`,
   * so the run goes on, when the cancel failed, or when the run had already
   * ended by the time the cancel came.
   */
  readonly cancelled: boolean;
  /** Why the cancel failed, when it did; `undefined` otherwise. */
  readonly cancelError: unknown;

  constructor(
    runId: string,
    events: readonly RunEvent[],
    cause: unknown,
    cancel: { readonly cancelled: boolean; readonly error?: unknown },
  ) {
    super(`Stopped following run "${runId}".`, { cause });
    this.runId = runId;
    this.events = events;
    this.cancelled = cancel.cancelled;
    this.cancelError = cancel.error;
  }
}

/** What asking the executor to cancel a run gave. */
interface CancelOutcome {
  readonly cancelled: boolean;
  readonly error?: unknown;
}

/** Events after which a run goes no further without someone: it ended, or it waits. */
const stopEvents: ReadonlySet<RunEvent["type"]> = new Set([
  "run.completed",
  "run.failed",
  "run.waiting",
]);

/**
 * How often in a row a follow subscribes again to a stream that broke
 * without bringing a new event. A new event starts the count again, so a
 * long follow survives many dropped connections, but a host that is gone
 * fails the follow after a few tries.
 */
export const maxResubscribes = 3;

/** Starts a workspace's workflow runs and follows them, through its {@link RunExecutor}. */
export class WorkflowRuns {
  readonly #executor: WorkflowRunsExecutor;

  constructor(executor: WorkflowRunsExecutor) {
    this.#executor = executor;
  }

  /**
   * Starts the workflow someone named, `id` or `hub/id`, and follows the run
   * until it ends or waits (requirement `app.run-start`). The caller checks
   * that the workspace is trusted first: a run runs its code and
   * connectors, and each surface asks for trust in its own way.
   *
   * @param workspace - a workspace the person trusts
   * @param typed - the workflow as typed, looked up as `lookUpWorkflow` does
   * @param input - the run's input
   * @param options - `signal` stops following and cancels the run; aborted before the start, nothing starts.
   *   `onEvent` sees each event while the run goes, as for {@link WorkflowRuns.follow}.
   *   `version` is recorded on the run's `run.started`
   * @throws what the executor's `start` throws, such as for a refused input
   * @throws the signal's reason, an `AbortError` by default, when
   *   `options.signal` was aborted before the start: nothing started
   * @throws RunFollowStopped when `options.signal` stops the follow, also
   *   while `start` is still in flight, with no events yet
   *
   * @example
   * await workflowRuns.startRun(workspace, "support-reply", { ticket: 42 });
   * // { found: "one", run: { summary: { status: "waiting", … }, events: [run.started, …] } }
   */
  async startRun(
    workspace: LoadedWorkspace,
    typed: string,
    input: Record<string, unknown>,
    options: StartRunOptions = {},
  ): Promise<StartedRun> {
    const lookup = lookUpWorkflow(hubWorkflows(workspace), typed);
    if (lookup.found !== "one") {
      return lookup;
    }
    options.signal?.throwIfAborted();
    const started = await this.#executor.start({
      hubId: lookup.hubId,
      workflowId: lookup.workflow.id,
      input,
      ...(options.version === undefined ? {} : { version: options.version }),
    });
    return { found: "one", run: await this.follow(started.id, options) };
  }

  /**
   * Follows a run until it ends or waits after `options.after`, and returns
   * its whole log with the summary worked out from it (requirement
   * `app.run-follow`). The log is read from its first event, so an event
   * recorded before the follow began, even the run's end, is never missed.
   * When the stream breaks after the follow has seen an event, it subscribes
   * again after the last one, at most {@link maxResubscribes} times in a row
   * without a new event (requirement `app.run-follow-resubscribe`).
   *
   * When `options.signal` aborts, the follow closes the stream, asks the
   * executor to cancel the run if it can, and then rejects (requirement
   * `app.run-cancel-on-abort`).
   *
   * @throws the error the executor's stream ends with, such as for an
   *   unknown run, once it may not subscribe again; the caller may follow again
   * @throws RunFollowStopped when `options.signal` stops the follow
   * @throws what `options.onEvent` throws
   *
   * @example
   * const before = summary.lastSeq;
   * await runEvents.sendEvent(summary.id, "approve");
   * await workflowRuns.follow(summary.id, { after: before });
   * // { summary: { status: "completed", … }, events: [run.started, …, run.completed] }
   */
  follow(runId: string, options: FollowOptions = {}): Promise<RunDetail> {
    return new RunFollow(this.#executor, runId, options).done;
  }
}

/** One follow of one run: its stream, the events it saw, and how it ends. */
class RunFollow {
  readonly done: Promise<RunDetail>;
  readonly #executor: WorkflowRunsExecutor;
  readonly #runId: string;
  readonly #after: number;
  readonly #signal: AbortSignal | undefined;
  readonly #onEventOption: FollowOptions["onEvent"];
  readonly #events: RunEvent[] = [];
  readonly #outcome = Promise.withResolvers<RunDetail>();
  #subscription: RunSubscription | undefined;
  #settled = false;
  /** Breaks in a row with no new event since the last subscribe. */
  #breaks = 0;

  constructor(executor: WorkflowRunsExecutor, runId: string, options: FollowOptions) {
    this.#executor = executor;
    this.#runId = runId;
    this.#after = options.after ?? 0;
    this.#signal = options.signal;
    this.#onEventOption = options.onEvent;
    this.done = this.#outcome.promise;
    // From seq 0: the stored events come first, then the new ones.
    this.#subscribe(0);
    if (this.#signal?.aborted) {
      this.#stop();
    } else {
      this.#signal?.addEventListener("abort", this.#stop, { once: true });
    }
  }

  #subscribe(afterSeq: number): void {
    // The port never calls the listener before `subscribe` returns, so
    // `#subscription` is set before `#end` can close it.
    this.#subscription = this.#executor.subscribe(this.#runId, afterSeq, {
      onEvent: (event) => this.#onEvent(event),
      onClose: (error) => this.#onClose(error),
    });
  }

  #onEvent(event: RunEvent): void {
    if (this.#settled) return;
    this.#events.push(event);
    this.#breaks = 0;
    try {
      this.#onEventOption?.(event, this.#events);
    } catch (error) {
      this.#end();
      this.#outcome.reject(error);
      return;
    }
    // `onEvent` may have stopped the follow, through the signal.
    if (this.#settled) return;
    if (event.seq > this.#after && stopEvents.has(event.type)) {
      this.#finishWithLog();
    }
  }

  #onClose(error: Error | undefined): void {
    if (this.#settled) return;
    if (error === undefined) {
      this.#finishWithLog();
      return;
    }
    const lastSeen = this.#events.at(-1);
    if (lastSeen === undefined || this.#breaks >= maxResubscribes) {
      this.#end();
      this.#outcome.reject(error);
      return;
    }
    this.#breaks += 1;
    this.#subscribe(lastSeen.seq);
  }

  #finishWithLog(): void {
    this.#end();
    const summary = summarize(this.#events);
    if (summary === null) {
      this.#outcome.reject(new KindedError("not_found", `Run "${this.#runId}" has no events.`));
      return;
    }
    this.#outcome.resolve({ summary, events: this.#events });
  }

  /** The signal aborted: stop following, cancel the run if the executor can, then reject. */
  readonly #stop = (): void => {
    if (this.#settled) return;
    this.#end();
    const events = [...this.#events];
    const reason: unknown = this.#signal?.reason;
    void this.#cancel().then((cancel) => {
      this.#outcome.reject(new RunFollowStopped(this.#runId, events, reason, cancel));
    });
  };

  async #cancel(): Promise<CancelOutcome> {
    if (this.#executor.cancel === undefined) return { cancelled: false };
    try {
      // A run that ended just before the cancel is left as it is, and its
      // summary says so: only a run that failed as cancelled was cancelled.
      const summary = await this.#executor.cancel(this.#runId);
      return { cancelled: summary.status === "failed" && summary.reason === "cancelled" };
    } catch (error) {
      return { cancelled: false, error };
    }
  }

  /** Settles the follow's stream: closes it and stops listening to the signal. */
  #end(): void {
    this.#settled = true;
    this.#subscription?.close();
    this.#signal?.removeEventListener("abort", this.#stop);
  }
}
