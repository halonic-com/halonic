import { type RunEvent, summarize } from "@halonicjs/events";
import type { Clock, RunStore } from "@halonicjs/ports";

/**
 * The `error` text of a run the engine ended as interrupted. Screens word the
 * reason themselves, from the approved microcopy; this text is the log's detail.
 */
export const interruptedError = "The engine stopped while this run was going.";

/**
 * Ends every run the engine lost when it stopped: each run whose status is
 * `running` gets a `run.failed` event with `reason: "interrupted"`
 * (requirement `engine.end-interrupted-runs`). The engine calls it once on
 * start, before it starts or resumes any run.
 *
 * Runs that are `waiting` for an event, a timer or a child run stay as they
 * are: they are meant to outlive a restart. A run whose log moved on while
 * this ran has a writer, so it isn't lost and stays as it is too.
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
    if (await endInterruptedRun(store, clock, run.id)) ended.push(run.id);
  }
  return ended;
}

/** Ends one run as interrupted if it is still running. True when it did. */
async function endInterruptedRun(store: RunStore, clock: Clock, runId: string): Promise<boolean> {
  // One read gives both the status and the last seq: with two reads, an end
  // event written between them would count in the seq, and the append would
  // put run.failed after run.completed. From here, the append's seq check
  // catches any later write.
  const summary = summarize(await store.events(runId));
  if (summary?.status !== "running") return false;
  const failed: RunEvent = {
    runId,
    seq: summary.lastSeq + 1,
    at: clock.now().toISOString(),
    type: "run.failed",
    state: summary.state,
    error: interruptedError,
    reason: "interrupted",
  };
  const result = await store.append(runId, summary.lastSeq, [failed]);
  return result.ok;
}
