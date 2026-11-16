import type { Clock, RunStore, Scheduler } from "@halonicjs/ports";
import { readRun } from "../kernel/step.ts";
import { endLostRuns } from "./end-interrupted-runs.ts";
import { childTimer } from "./run-timer-ids.ts";

/**
 * Ends the runs the engine lost when it stopped, and wakes the parents of the ones that
 * had one on a `child:` timer; `ended` then runs for each of them (their folders end last).
 *
 * @returns how many runs ended as `interrupted`
 */
export async function sweepLostRuns(
  store: RunStore,
  clock: Clock,
  scheduler: Pick<Scheduler, "schedule">,
  ended: (runId: string) => Promise<void>,
): Promise<number> {
  const lost = await endLostRuns(store, clock);
  const all = [...lost.interrupted, ...lost.cancelled];
  for (const runId of all) {
    const parent = (await readRun(store, runId))?.parent;
    if (parent == null) continue;
    await scheduler.schedule(parent.runId, `${childTimer}${runId}`, clock.now().toISOString());
  }
  for (const runId of all) await ended(runId);
  return lost.interrupted.length;
}
