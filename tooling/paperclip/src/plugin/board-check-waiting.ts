import {
  chainReadLimit,
  countHeldUp,
  type OpenTask,
  rankWaiting,
  readWaitingRecord,
  type WaitingTask,
  waitingDocument,
  waitingSince,
  waitReason,
} from "../board-check/waiting.ts";
import type { BoardCheckApi, PartPlan } from "./board-check-api.ts";
import { stateKey } from "./board-check-api.ts";

/**
 * The board check's part (b), once an hour: finds the open tasks waiting on
 * the board, counts what each holds up through Paperclip's blocker links,
 * and plans the `board-waiting` document when the list changed. It saves
 * the list in plugin state for `board_waiting`.
 */

const closed = new Set(["done", "cancelled"]);

/** Whether a task in review has a pending board card, for a listing without review attention. */
async function pendingCard(ctx: BoardCheckApi, task: OpenTask, companyId: string) {
  if (task.status !== "in_review" || task.reviewAttention !== undefined) {
    return false;
  }
  const cards = await ctx.issues.listInteractions(task.id, companyId);
  return cards.some((card) => card.status === "pending");
}

/** Plans part (b) from the pass's one listing of open tasks. */
export async function planWaiting(
  ctx: BoardCheckApi,
  companyId: string,
  openTasks: readonly OpenTask[],
  names: ReadonlyMap<string, string>,
  now: Date,
): Promise<PartPlan & { readonly waiting: number }> {
  const budget = { reads: chainReadLimit };
  const dependentsOf = async (taskId: string) =>
    (await ctx.issues.relations.get(taskId, companyId)).blocks
      .filter((dependent) => !closed.has(dependent.status))
      .map((dependent) => dependent.id);
  const waiting: WaitingTask[] = [];
  for (const task of openTasks) {
    const reason = waitReason(task, await pendingCard(ctx, task, companyId));
    if (reason === undefined || task.identifier === null) {
      continue;
    }
    const held = await countHeldUp(task.id, dependentsOf, budget);
    waiting.push({
      taskId: task.id,
      identifier: task.identifier,
      reason,
      holderAgentId: task.assigneeAgentId,
      blocks: held.blocks,
      blocksAtLeast: held.atLeast,
      since: waitingSince(task),
    });
  }
  const ranked = rankWaiting(waiting);
  const key = stateKey(companyId, "waiting");
  const before = readWaitingRecord(await ctx.state.get(key));
  const body = waitingDocument(ranked, names);
  // The first pass writes the document only when something waits; later passes when the list changed.
  const changed =
    before === undefined ? ranked.length > 0 : waitingDocument(before.tasks, names) !== body;
  return {
    // The document is updated in place, and only when the list changed.
    writes: changed ? [{ kind: "document", key: "board-waiting", body }] : [],
    save: () => ctx.state.set(key, { at: now.toISOString(), tasks: ranked }),
    waiting: ranked.length,
  };
}
