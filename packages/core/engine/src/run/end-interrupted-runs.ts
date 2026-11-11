import { type RunEvent, type RunFailureReason, summarize } from "@halonicjs/events";
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
  // The list may lag the log, so each run is checked again against its log.
  const listed = await store.list({ status: "running" });
  const ended: string[] = [];
  for (const run of listed) {
    if (await endRun(store, clock, run.id, "running", interruptedError, "interrupted")) {
      ended.push(run.id);
    }
  }
  return [...ended, ...(await endOrphanedChildren(store, clock))];
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
  };
  const result = await store.append(runId, summary.lastSeq, [failed]);
  return result.ok;
}
