import {
  type LoadAgent,
  type LoadTask,
  loadLines,
  loadSection,
  readLoad,
  sameLoad,
  teamLoad,
} from "../board-check/load.ts";
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
import type { BoardWrite } from "../board-check/writes.ts";
import type { BoardCheckApi, PartPlan } from "./board-check-api.ts";
import { stateKey } from "./board-check-api.ts";

/**
 * The board check's parts (b) and (c), once an hour: finds the open tasks
 * waiting on the board, counts what each holds up through Paperclip's
 * blocker links, adds the team load for Chief, and plans the
 * `board-waiting` document when it would read differently from the last
 * one sent, and one comment to Chief when the load differs from the last
 * one sent. It saves the list in plugin state for `board_waiting`.
 */

const closed = new Set(["done", "cancelled"]);

/** Whether a task in review has a pending board card, for a listing without review attention. */
export async function pendingCard(ctx: BoardCheckApi, task: OpenTask, companyId: string) {
  if (task.status !== "in_review" || task.reviewAttention !== undefined) {
    return false;
  }
  const cards = await ctx.issues.listInteractions(task.id, companyId);
  return cards.some((card) => card.status === "pending");
}

/** What the hourly parts read: the pass's listing of open tasks and the agents. */
export interface HourlyInput {
  readonly openTasks: readonly (OpenTask & LoadTask)[];
  readonly agents: readonly (LoadAgent & { readonly name: string })[];
  readonly chiefTaskId: string | undefined;
}

/** Plans parts (b) and (c) from the pass's one listing of open tasks. */
export async function planWaiting(
  ctx: BoardCheckApi,
  companyId: string,
  input: HourlyInput,
  now: Date,
): Promise<PartPlan & { readonly waiting: number }> {
  const { openTasks, chiefTaskId } = input;
  const names = new Map(input.agents.map((agent) => [agent.id, agent.name]));
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
  const load = teamLoad(openTasks, input.agents);
  const key = stateKey(companyId, "waiting");
  const saved = (await ctx.state.get(key)) as { sentLoad?: unknown } | null;
  // Compared with what last went out, not with the last list: while writes
  // are off the list moves on, but the document and Chief don't hear of it.
  const sentBody = readWaitingRecord(saved)?.sentBody;
  const sentLoad = readLoad(saved?.sentLoad);
  const body = `${waitingDocument(ranked, names)}\n\n${loadSection(load, names)}`;
  // The first pass writes the document only when something waits.
  const changed = sentBody === undefined ? ranked.length > 0 : sentBody !== body;
  const document: BoardWrite = { kind: "document", key: "board-waiting", body };
  const chiefComment: BoardWrite | undefined =
    chiefTaskId !== undefined && (sentLoad === undefined || !sameLoad(sentLoad, load))
      ? {
          kind: "comment",
          taskId: chiefTaskId,
          body: ["Team load changed (Pip left out):", ...loadLines(load, names)].join("\n"),
        }
      : undefined;
  const writes = [...(changed ? [document] : []), ...(chiefComment ? [chiefComment] : [])];
  return {
    writes,
    save: (sent) =>
      ctx.state.set(key, {
        at: now.toISOString(),
        tasks: ranked,
        // Plugin state is JSON, so a field left undefined is simply not kept.
        sentBody: sent.has(document) ? body : sentBody,
        sentLoad: chiefComment !== undefined && sent.has(chiefComment) ? load : sentLoad,
      }),
    waiting: ranked.length,
  };
}
