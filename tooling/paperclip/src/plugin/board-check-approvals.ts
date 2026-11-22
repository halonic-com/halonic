import { planApprovals, readSeenApprovals } from "../board-check/approvals.ts";
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
  const plan = planApprovals(pending, readSeenApprovals(await ctx.state.get(key)), names);
  return {
    writes:
      plan.comment === undefined
        ? []
        : [{ kind: "comment", taskId: checkerTaskId, body: plan.comment }],
    save: () => ctx.state.set(key, plan.seen),
  };
}
