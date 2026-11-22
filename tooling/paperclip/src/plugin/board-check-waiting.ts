import {
  chainReadLimit,
  countHeldUp,
  type OpenTask,
  rankWaiting,
  readWaitingRecord,
  type WaitingRecord,
  type WaitingTask,
  waitingDocument,
  waitingSince,
  waitReason,
} from "../board-check/waiting.ts";
import type { BoardWrite } from "../board-check/writes.ts";
import type { BoardCheckApi, PartPlan } from "./board-check-api.ts";
import { stateKey } from "./board-check-api.ts";

/**
 * The board check's part (b), once an hour: finds the open tasks waiting on
 * the board, counts what each holds up through Paperclip's blocker links,
 * and plans the `board-waiting` document when it would read differently
 * from the last one sent. It saves the list in plugin state for
 * `board_waiting`.
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
  const sentBefore = readWaitingRecord(await ctx.state.get(key))?.sentBody;
  const body = waitingDocument(ranked, names);
  // Compared with what last went out, not with the last list: while writes
  // are off the list moves on, but the document doesn't.
  const changed = sentBefore === undefined ? ranked.length > 0 : sentBefore !== body;
  const write: BoardWrite = { kind: "document", key: "board-waiting", body };
  return {
    // The document is updated in place, and only when it would read differently.
    writes: changed ? [write] : [],
    save: (sent) => {
      const sentBody = sent.has(write) ? body : sentBefore;
      const record: WaitingRecord =
        sentBody === undefined
          ? { at: now.toISOString(), tasks: ranked }
          : { at: now.toISOString(), tasks: ranked, sentBody };
      return ctx.state.set(key, record);
    },
    waiting: ranked.length,
  };
}
