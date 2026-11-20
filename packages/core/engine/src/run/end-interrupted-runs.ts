import {
  type RunEvent,
  type RunFailureCause,
  type RunFailureReason,
  summarize,
} from "@halonicjs/events";
import type { Clock, RunStore } from "@halonicjs/ports";
import { hasEnded } from "../kernel/run-state.ts";

/**
 * The `error` text of a run the engine ended as interrupted. Screens word the
 * reason themselves, from the approved microcopy; this text is the log's detail.
 */
export const interruptedError = "The engine stopped while this run was going.";

/** The `error` text of a waiting child run the engine ended because its parent had ended. */
export const parentEndedError = "The run that started this one ended, so this one was cancelled.";

/**
 * Ends every run the engine lost when it stopped: each run whose status is
 * `running` gets a `run.failed` event with `reason: "interrupted"`
 * (requirement `engine.end-interrupted-runs`). Then each child run left
 * `waiting` under a parent that has ended gets one with `reason: "cancelled"`
 * (requirement `engine.end-orphaned-child-runs`). The engine calls it once on
 * start, before it starts or resumes any run.
 *
 * Other runs that are `waiting` for an event, a timer or a child run stay as
 * they are: they are meant to outlive a restart. A run whose log moved on
 * while this ran has a writer, so it isn't lost and stays as it is too.
 *
 * Two things are left to the run kernel (HAL-186), which calls this:
 * - It assumes one engine per run store. A second engine on the same store
 *   would end the first one's live runs, so the kernel needs a lock or a
 *   stated "one engine per store" rule before it calls this.
 * - A parent `waiting` on a child that ends here must be woken, as on any
 *   child `run.failed`; this function only writes the child's event.
 *
 * @returns the ids of the runs it ended
 */
export async function endInterruptedRuns(store: RunStore, clock: Clock): Promise<string[]> {
  const { interrupted, cancelled } = await endLostRuns(store, clock);
  return [...interrupted, ...cancelled];
}

/** The runs {@link endLostRuns} ended, by the reason it gave. */
export interface EndedLostRuns {
  /** The runs that were going when the engine stopped, ended with `reason: "interrupted"`. */
  readonly interrupted: string[];
  /** The waiting child runs of an ended parent, ended with `reason: "cancelled"`. */
  readonly cancelled: string[];
}

/**
 * Does what {@link endInterruptedRuns} does and tells the two kinds of run
 * apart (requirement `engine.report-interrupted-runs`): the Studio tells the
 * user how many of their runs the restart cut off, and a child cancelled
 * because its parent ended isn't one of them.
 */
export async function endLostRuns(store: RunStore, clock: Clock): Promise<EndedLostRuns> {
  // The list may lag the log, so each run is checked again against its log.
  const listed = await store.list({ status: "running" });
  const interrupted: string[] = [];
  for (const run of listed) {
    if (await endRun(store, clock, run.id, "running", interruptedError, "interrupted")) {
      interrupted.push(run.id);
    }
  }
  return { interrupted, cancelled: await endOrphanedChildren(store, clock) };
}

/**
 * Ends the runs an engine stopped on purpose, right after it closed, as {@link endLostRuns} would
 * end them on its next start, with `cause` saying why it stopped (requirement
 * `engine.end-stopped-runs`): each `running` run gets `run.failed` with `reason: "interrupted"`
 * and `cause`, and so does each parent `waiting` on it, up to the top-level run, since nothing will
 * wake it. Then each waiting child of an ended run is cancelled. Call it only after the engine has
 * closed, so no run it lists is still going.
 *
 * @returns the runs it ended, by the reason it gave
 */
export async function endStoppedRuns(
  store: RunStore,
  clock: Clock,
  cause: RunFailureCause,
): Promise<EndedLostRuns> {
  const listed = await store.list({ status: "running" });
  const interrupted: string[] = [];
  for (const run of listed) {
    if (await endRun(store, clock, run.id, "running", interruptedError, "interrupted", cause)) {
      interrupted.push(run.id, ...(await endWaitingParents(store, clock, run.parentRunId, cause)));
    }
  }
  return { interrupted, cancelled: await endOrphanedChildren(store, clock) };
}

/** Ends the run `runId` and each run above it while it waits, as {@link endStoppedRuns} does. */
async function endWaitingParents(
  store: RunStore,
  clock: Clock,
  runId: string | null,
  cause: RunFailureCause,
): Promise<string[]> {
  const ended: string[] = [];
  for (let parent = runId; parent !== null; ) {
    const summary = summarize(await store.events(parent));
    if (
      summary === null ||
      !(await endRun(store, clock, parent, "waiting", interruptedError, "interrupted", cause))
    ) {
      break;
    }
    ended.push(parent);
    parent = summary.parentRunId;
  }
  return ended;
}

/**
 * Ends each child run left `waiting` under a parent that has ended, as when
 * the engine stopped after the parent's end was written and before its
 * children were cancelled: no one would ever answer it. A child ended here
 * may leave its own child waiting under an ended parent, so the waiting runs
 * are looked at again until a pass ends none.
 */
async function endOrphanedChildren(store: RunStore, clock: Clock): Promise<string[]> {
  let children = (await store.list({ status: "waiting" })).filter(
    (run) => run.parentRunId !== null,
  );
  const ended: string[] = [];
  for (let endedSome = true; endedSome; ) {
    endedSome = false;
    const left: typeof children = [];
    for (const child of children) {
      const orphaned = await hasEndedRun(store, child.parentRunId);
      if (
        orphaned &&
        (await endRun(store, clock, child.id, "waiting", parentEndedError, "cancelled"))
      ) {
        ended.push(child.id);
        endedSome = true;
      } else {
        left.push(child);
      }
    }
    children = left;
  }
  return ended;
}

/** Whether the run has a log that ends with an end event. */
async function hasEndedRun(store: RunStore, runId: string | null): Promise<boolean> {
  if (runId === null) return false;
  const summary = summarize(await store.events(runId));
  return summary !== null && hasEnded(summary.status);
}

/** Ends one run with `run.failed` if its status is still `status`. True when it did. */
async function endRun(
  store: RunStore,
  clock: Clock,
  runId: string,
  status: "running" | "waiting",
  error: string,
  reason: RunFailureReason,
  cause?: RunFailureCause,
): Promise<boolean> {
  // One read gives both the status and the last seq: with two reads, an end
  // event written between them would count in the seq, and the append would
  // put run.failed after run.completed. From here, the append's seq check
  // catches any later write.
  const summary = summarize(await store.events(runId));
  if (summary?.status !== status) return false;
  const failed: RunEvent = {
    runId,
    seq: summary.lastSeq + 1,
    at: clock.now().toISOString(),
    type: "run.failed",
    state: summary.state,
    error,
    reason,
    ...(cause === undefined ? {} : { cause }),
  };
  const result = await store.append(runId, summary.lastSeq, [failed]);
  return result.ok;
}
