import { planStale, readStale, type StaleTask } from "../board-check/stale.ts";
import { type BoardWrite, ceilings } from "../board-check/writes.ts";
import { type BoardCheckApi, type PartPlan, stateKey } from "./board-check-api.ts";

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
