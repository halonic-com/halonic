import { planStale, readStale, type StaleTask } from "../board-check/stale.ts";
import { type BoardWrite, ceilings } from "../board-check/writes.ts";
import { taskOfBranch } from "../pr-watcher/discover.ts";
import type { Snapshot } from "../snapshot/shape.ts";
import { loadSnapshot } from "../snapshot/store.ts";
import { type BoardCheckApi, errorCode, type PartPlan, stateKey } from "./board-check-api.ts";

/**
 * The board check's stale-task part, once an hour (HAL-17732). It sorts the
 * pass's listing of open tasks, keeps the lists in plugin state, and wakes
 * Chief once per todo nobody holds. It plans last, inside the room the
 * pass's other writes leave under the gate's ceilings.
 */

/** What the gate's ceilings leave for one more part after `planned`. */
export function roomLeft(planned: readonly BoardWrite[]) {
  const count = (kind: BoardWrite["kind"]) => planned.filter((write) => write.kind === kind).length;
  return { comment: ceilings.comment - count("comment"), wake: ceilings.wake - count("wake") };
}

/**
 * The tasks whose branch has an open pull request in the PR watcher's
 * snapshot, so the part sends no GitHub request. Branches in forks don't count.
 */
export function openPullTasks(snapshot: Snapshot | undefined): Set<string> {
  const found = new Set<string>();
  for (const { repo, pulls } of snapshot?.repos ?? []) {
    for (const pull of pulls) {
      const task = taskOfBranch(pull.branch);
      if (pull.state === "open" && pull.headRepo?.toLowerCase() === repo.toLowerCase() && task) {
        found.add(task);
      }
    }
  }
  return found;
}

/** The snapshot's open pull requests; none when it can't be read, so the rest of the part still runs. */
async function readOpenPulls(ctx: BoardCheckApi, companyId: string): Promise<Set<string>> {
  try {
    return openPullTasks(await loadSnapshot(ctx, companyId));
  } catch (error) {
    ctx.logger.error(`Board check: couldn't read the GitHub snapshot (${errorCode(error)}).`, {
      companyId,
    });
    return new Set();
  }
}

/** Plans the stale part from the pass's one listing of open tasks. */
export async function planStalePart(
  ctx: BoardCheckApi,
  companyId: string,
  input: {
    readonly openTasks: readonly StaleTask[];
    readonly chiefTaskId: string | undefined;
    readonly planned: readonly BoardWrite[];
  },
  now: Date,
): Promise<PartPlan> {
  const key = stateKey(companyId, "stale");
  const plan = planStale(readStale(await ctx.state.get(key)), input.openTasks, {
    chiefTaskId: input.chiefTaskId,
    room: roomLeft(input.planned),
    now,
    openPulls: await readOpenPulls(ctx, companyId),
  });
  return {
    writes: plan.writes,
    save: (sent) =>
      ctx.state.set(
        key,
        plan.writes.every((write) => sent.has(write)) ? plan.record : plan.recordIfUnsent,
      ),
  };
}
