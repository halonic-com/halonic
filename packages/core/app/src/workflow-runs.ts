// Starting a workflow run and following it until it ends or waits for
// someone, for `halonic run <workflow>` and later the Studio's Run button
// (HAL-3814). It takes the `RunExecutor` port, so `app` still imports no
// engine. Sending an event to a waiting run is `RunEvents.sendEvent`; this
// service only follows the run again afterwards.

import { type RunEvent, summarize } from "@halonicjs/events";
import type { RunExecutor } from "@halonicjs/ports";
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
   * Stops following, as Ctrl C does: the follow rejects with
   * {@link RunFollowStopped}. The run itself goes on, because the
   * `RunExecutor` port can't cancel a run yet.
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

/**
 * The follow of `runId` was stopped through its signal before the run ended
 * or waited. `events` are the ones seen until then, oldest first, so a
 * surface can name the last step that ran.
 */
export class RunFollowStopped extends Error {
  override readonly name = "RunFollowStopped";
  readonly runId: string;
  readonly events: readonly RunEvent[];

  constructor(runId: string, events: readonly RunEvent[], cause: unknown) {
    super(`Stopped following run "${runId}".`, { cause });
    this.runId = runId;
    this.events = events;
  }
}

/** Events after which a run goes no further without someone: it ended, or it waits. */
const stopEvents: ReadonlySet<RunEvent["type"]> = new Set([
  "run.completed",
  "run.failed",
  "run.waiting",
]);

/** Starts a workspace's workflow runs and follows them, through its {@link RunExecutor}. */
export class WorkflowRuns {
  readonly #executor: Pick<RunExecutor, "start" | "subscribe">;

  constructor(executor: Pick<RunExecutor, "start" | "subscribe">) {
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
   * @param options - `signal` stops following; aborted before the start, nothing starts.
   *   `onEvent` sees each event while the run goes, as for {@link WorkflowRuns.follow}
   * @throws what the executor's `start` throws, such as for a refused input
   * @throws RunFollowStopped when `options.signal` stops the follow
   *
   * @example
   * await workflowRuns.startRun(workspace, "support-reply", { ticket: 42 });
   * // { found: "one", run: { summary: { status: "waiting", … }, events: [run.started, …] } }
   */
  async startRun(
    workspace: LoadedWorkspace,
    typed: string,
    input: Record<string, unknown>,
    options: Omit<FollowOptions, "after"> = {},
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
    });
    return { found: "one", run: await this.follow(started.id, options) };
  }

  /**
   * Follows a run until it ends or waits after `options.after`, and returns
   * its whole log with the summary worked out from it (requirement
   * `app.run-follow`). The log is read from its first event, so an event
   * recorded before the follow began, even the run's end, is never missed.
   *
   * @throws the error the executor's stream ends with, such as for an
   *   unknown run; the caller may follow again
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
    const { after = 0, signal, onEvent } = options;
    return new Promise((resolve, reject) => {
      const events: RunEvent[] = [];
      let settled = false;

      const finish = (outcome: () => void) => {
        if (settled) return;
        settled = true;
        subscription.close();
        signal?.removeEventListener("abort", onAbort);
        outcome();
      };
      const finishWithLog = () => {
        finish(() => {
          const summary = summarize(events);
          if (summary === null) {
            reject(new KindedError("not_found", `Run "${runId}" has no events.`));
            return;
          }
          resolve({ summary, events });
        });
      };
      const onAbort = () => {
        finish(() => reject(new RunFollowStopped(runId, [...events], signal?.reason)));
      };

      // From seq 0: the stored events come first, then the new ones.
      const subscription = this.#executor.subscribe(runId, 0, {
        onEvent: (event) => {
          if (settled) return;
          events.push(event);
          try {
            onEvent?.(event, events);
          } catch (error) {
            finish(() => reject(error));
            return;
          }
          // `onEvent` may have stopped the follow, through the signal.
          if (settled) return;
          if (event.seq > after && stopEvents.has(event.type)) {
            finishWithLog();
          }
        },
        onClose: (error) => {
          if (error === undefined) {
            finishWithLog();
          } else {
            finish(() => reject(error));
          }
        },
      });
      // The port never calls the listener before `subscribe` returns, so
      // `subscription` is set before anything above can use it.
      if (signal?.aborted) {
        onAbort();
      } else {
        signal?.addEventListener("abort", onAbort, { once: true });
      }
    });
  }
}
