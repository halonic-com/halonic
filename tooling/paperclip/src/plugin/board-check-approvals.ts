import { planApprovals, readSeenApprovals } from "../board-check/approvals.ts";
import type { BoardWrite } from "../board-check/writes.ts";
import { type BoardCheckApi, type PartPlan, stateKey } from "./board-check-api.ts";

/**
 * The board check's part (d): new pending approvals, read directly with
 * `approvals.read`, listed in one comment on the Board Checker's task.
 * It only reads approvals; the plugin context it gets can't decide one.
 */
export async function planApprovalsPart(
  ctx: BoardCheckApi,
  companyId: string,
  checkerTaskId: string,
  names: ReadonlyMap<string, string>,
): Promise<PartPlan> {
  const key = stateKey(companyId, "approvals");
  const pending = await ctx.approvals.list({ companyId, status: "pending" });
  const seenBefore = readSeenApprovals(await ctx.state.get(key));
  const plan = planApprovals(pending, seenBefore, names);
  const comment: BoardWrite | undefined =
    plan.comment === undefined
      ? undefined
      : { kind: "comment", taskId: checkerTaskId, body: plan.comment };
  return {
    writes: comment === undefined ? [] : [comment],
    // A comment that was only logged (writes off) leaves its approvals
    // unseen, so they are listed once writes are on. Ids no longer pending
    // still drop out, so the record never grows.
    save: (sent) =>
      ctx.state.set(
        key,
        comment === undefined || sent.has(comment)
          ? plan.seen
          : (seenBefore ?? []).filter((id) => plan.seen.includes(id)),
      ),
  };
}
