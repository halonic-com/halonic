import {
  type ActiveRun,
  planPiles,
  queuedPiles,
  readPiles,
  subtreeReadLimit,
} from "../board-check/piles.ts";
import { type BoardCheckApi, type PartPlan, stateKey } from "./board-check-api.ts";

/**
 * The board check's queued-run piles, the rest of part (a). For each open
 * task with a run in its queue (from the pass's one listing), it reads the
 * task's queued and running runs through `issues.getSubtree`, at most
 * `subtreeReadLimit` tasks a pass, and plans one line when an agent has a
 * new pile. It saves the count in plugin state for `failed_runs`.
 */

/** A listed task, limited to what the piles part reads. */
export interface PileTask {
  readonly id: string;
  readonly activeRun?: unknown;
}

/** Plans the piles part from the pass's listing of open tasks. */
export async function planPilesPart(
  ctx: BoardCheckApi,
  companyId: string,
  input: {
    readonly openTasks: readonly PileTask[];
    readonly boardCheckerTaskId: string;
    readonly names: ReadonlyMap<string, string>;
  },
  now: Date,
): Promise<PartPlan> {
  const withRuns = input.openTasks.filter((task) => task.activeRun != null);
  const runs: ActiveRun[] = [];
  for (const task of withRuns.slice(0, subtreeReadLimit)) {
    const subtree = await ctx.issues.getSubtree(task.id, companyId, {
      includeRoot: true,
      includeActiveRuns: true,
    });
    for (const active of Object.values(subtree.activeRuns ?? {})) {
      runs.push(...active.map(({ id, agentId, status }) => ({ id, agentId, status })));
    }
  }
  const key = stateKey(companyId, "piles");
  const plan = planPiles(
    readPiles(await ctx.state.get(key)),
    { piles: queuedPiles(runs), partial: withRuns.length > subtreeReadLimit },
    { boardCheckerTaskId: input.boardCheckerTaskId, names: input.names, now },
  );
  return {
    writes: plan.writes,
    save: (sent) =>
      ctx.state.set(
        key,
        plan.writes.every((write) => sent.has(write)) ? plan.record : plan.recordIfUnsent,
      ),
  };
}
