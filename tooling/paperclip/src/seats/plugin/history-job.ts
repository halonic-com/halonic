import { agentSeat } from "../agent-seat.ts";
import { placementChanges } from "../placements.ts";
import type { AgentActivity, AgentId, SeatId } from "../records.ts";
import { bucketMs, bucketStart, usageBuckets } from "../usage-buckets.ts";
import type { HistoryStore } from "./history-store.ts";
import type { PaperclipTables } from "./paperclip-tables.ts";
import { type ReadJobApi, seatsOwner } from "./read-job.ts";

/**
 * How far back each run sums the cost rows again. A cost row is written when
 * its run ends, so a bucket may still grow after the run that first stored
 * it; summing the last hour again each time catches those late rows.
 */
export const usageLookbackMs = 6 * bucketMs;

export interface HistoryJobDeps {
  readonly tables: PaperclipTables;
  readonly store: HistoryStore;
  readonly now: () => Date;
}

/**
 * The `seats.history` job, every 10 minutes, for the company whose settings
 * list the seats: records which seat each agent is on, its tokens per
 * 10-minute bucket and what it has on now. It logs counts only, never a
 * folder or a connection id.
 */
export async function runSeatsHistory(ctx: ReadJobApi, deps: HistoryJobDeps): Promise<void> {
  const owner = await seatsOwner(ctx);
  if (owner === undefined) {
    return;
  }
  const now = deps.now();
  const at = now.toISOString();
  const agents = await deps.tables.agentsNow(owner.companyId);
  const seatsNow = new Map<AgentId, SeatId | undefined>(
    agents.map((agent) => [agent.agentId, agentSeat(agent, owner.settings.seats)]),
  );

  const since = bucketStart(new Date(now.getTime() - usageLookbackMs).toISOString());
  const placements = await deps.store.placementsSince(since);
  const changes = placementChanges(placements, seatsNow, at, "observed");
  await deps.store.savePlacementChanges(changes);

  // The placements as they stand now: closed ones end now, new ones start now.
  const current = [
    ...placements.filter((placement) => !changes.closed.some((closed) => same(closed, placement))),
    ...changes.closed,
    ...changes.opened,
  ];
  const usage = usageBuckets(await deps.tables.costRowsSince(owner.companyId, since), current);
  await deps.store.saveUsage(usage);

  const activity: AgentActivity[] = agents
    .filter((agent) => seatsNow.get(agent.agentId) !== undefined)
    .map((agent) => ({
      agentId: agent.agentId,
      at: bucketStart(at),
      runningRuns: agent.runningRuns,
      queuedRuns: agent.queuedRuns,
      openTasks: agent.openTasks,
      cap: agent.cap,
      model: agent.model,
    }));
  await deps.store.recordActivity(activity);

  ctx.logger.info(
    `seats.history: ${activity.length} agents on a seat, ${changes.opened.length} placements started, ${changes.closed.length} ended, ${usage.length} usage buckets.`,
    { companyId: owner.companyId },
  );
}

function same(
  a: { readonly agentId: string; readonly from: string },
  b: { readonly agentId: string; readonly from: string },
): boolean {
  return a.agentId === b.agentId && a.from === b.from;
}
