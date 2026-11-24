import { planTrend, readMergeSpeedRecord, trackQueue } from "../board-check/merge-speed.ts";
import type { BoardWrite } from "../board-check/writes.ts";
import { readAgentMergeRecord, trackAgentMerges } from "../snapshot/agent-merges.ts";
import { loadSnapshot } from "../snapshot/store.ts";
import { type BoardCheckApi, errorCode, type PartPlan, stateKey } from "./board-check-api.ts";

/**
 * The board check's part (e): merge speed from the PR watcher's snapshot in
 * plugin state, so it sends no GitHub request. Every job pass follows the
 * queue; the first pass of each hour may comment the 6-hour trend on the
 * Board Checker's task, only when a figure moved clearly.
 */
export async function planMergeSpeed(
  ctx: BoardCheckApi,
  companyId: string,
  checkerTaskId: string,
  hourly: boolean,
  now: Date,
): Promise<PartPlan> {
  const nothing: PartPlan = { writes: [], save: async () => {} };
  let snapshot: Awaited<ReturnType<typeof loadSnapshot>>;
  try {
    snapshot = await loadSnapshot(ctx, companyId);
  } catch (error) {
    // A snapshot of a shape this code doesn't read: skip the part, keep the rest of the pass.
    ctx.logger.error(`Board check: couldn't read the GitHub snapshot (${errorCode(error)}).`, {
      companyId,
    });
    return nothing;
  }
  if (snapshot === undefined) {
    return nothing;
  }
  const key = stateKey(companyId, "merge-speed");
  const tracked = trackQueue(readMergeSpeedRecord(await ctx.state.get(key)), snapshot);
  // Merges per agent for the board's `github/summary` route: the snapshot
  // keeps a few days, the record 30.
  const mergesKey = stateKey(companyId, "agent-merges");
  const merges = trackAgentMerges(readAgentMergeRecord(await ctx.state.get(mergesKey)), snapshot);
  const plan = hourly ? planTrend(tracked, snapshot, now) : { comment: undefined, record: tracked };
  const comment: BoardWrite | undefined =
    plan.comment === undefined
      ? undefined
      : { kind: "comment", taskId: checkerTaskId, body: plan.comment };
  return {
    writes: comment === undefined ? [] : [comment],
    // A trend comment only logged while writes are off doesn't count as
    // reported: the next hour compares with the figures that last went out.
    save: async (sent) => {
      await ctx.state.set(
        key,
        comment === undefined || sent.has(comment)
          ? plan.record
          : { ...plan.record, reported: tracked.reported },
      );
      await ctx.state.set(mergesKey, merges);
    },
  };
}
