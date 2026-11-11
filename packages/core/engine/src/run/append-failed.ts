// How the local executor ends a run with `run.failed`: on the run's log as
// it is when the write lands, so a write that got there first is kept.

import { type RunEvent, type RunFailureReason, summarize } from "@halonicjs/events";
import type { RunStore } from "@halonicjs/ports";
import { hasEnded } from "../kernel/run-state.ts";

/**
 * Ends a run that hasn't ended with `run.failed`, reading again when another
 * write got there first.
 *
 * @param now - the time of the event, read again on each try
 * @returns whether this call ended the run: `false` when it has no log or had already ended
 */
export async function appendFailed(
  store: Pick<RunStore, "events" | "append">,
  runId: string,
  error: string,
  reason: RunFailureReason,
  now: () => string,
): Promise<boolean> {
  for (;;) {
    const summary = summarize(await store.events(runId));
    if (summary === null || hasEnded(summary.status)) return false;
    const failed: RunEvent = {
      runId,
      seq: summary.lastSeq + 1,
      at: now(),
      type: "run.failed",
      state: summary.state,
      error,
      reason,
    };
    if ((await store.append(runId, summary.lastSeq, [failed])).ok) return true;
  }
}
