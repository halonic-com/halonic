import type { IssueComment } from "@paperclipai/plugin-sdk";
import {
  type AskComment,
  asksDocument,
  askWindowMs,
  newAsks,
  readSeenAsks,
  rememberAsks,
} from "../board-check/asks.ts";
import { type BoardCheckApi, type PartPlan, stateKey } from "./board-check-api.ts";
import type { ListedIssue } from "./host.ts";

/** The board check's ask part: spots new board asks and plans the `board-asks` document and one wake. */

function askComment(task: { id: string; identifier: string | null }) {
  return (comment: IssueComment): AskComment => ({
    id: comment.id,
    taskId: task.id,
    identifier: task.identifier ?? "",
    authorAgentId: comment.authorType === "agent" ? comment.authorAgentId : null,
    createdAt: new Date(comment.createdAt).toISOString(),
    origin: comment.origin,
    body: comment.deletedAt == null ? comment.body : "",
  });
}

/** Where a pass looks for asks: the one task an event names, or the pass's listing of open tasks. */
export type AskScope = { readonly only: string } | { readonly openTasks: readonly ListedIssue[] };

/** The tasks to read comments on: the one an event names, or every open task active in the window. */
async function askTasks(ctx: BoardCheckApi, companyId: string, now: Date, scope: AskScope) {
  if ("only" in scope) {
    const task = await ctx.issues.get(scope.only, companyId);
    return task === null ? [] : [task];
  }
  const since = now.getTime() - askWindowMs;
  return scope.openTasks.filter(
    (task) => new Date(task.lastActivityAt ?? task.updatedAt).getTime() >= since,
  );
}

/** Spots new asks; plans the `board-asks` document and one wake of the Board Checker for the batch. */
export async function planAsks(
  ctx: BoardCheckApi,
  companyId: string,
  checkerTaskId: string,
  now: Date,
  scope: AskScope,
): Promise<PartPlan & { readonly found: number }> {
  const checkerTask = await ctx.issues.get(checkerTaskId, companyId);
  const agents = await ctx.agents.list({ companyId, limit: 500 });
  const rules = {
    boardCheckerAgentId: checkerTask?.assigneeAgentId ?? undefined,
    mergerAgentId: agents.find((agent) => agent.urlKey === "merger")?.id,
  };
  const seen = readSeenAsks(await ctx.state.get(stateKey(companyId, "asks")));
  const seenIds = new Set(seen.map((ask) => ask.commentId));
  const found = [];
  for (const task of await askTasks(ctx, companyId, now, scope)) {
    const comments = (await ctx.issues.listComments(task.id, companyId)).map(askComment(task));
    found.push(...newAsks(comments, seenIds, rules, now));
  }
  const first = found[0];
  if (first === undefined) {
    return { writes: [], save: async () => {}, found: 0 };
  }
  const tasks = [...new Set(found.map((ask) => ask.identifier))].join(", ");
  ctx.logger.info(`Board check: ${found.length} new board asks on ${tasks}.`, { companyId });
  const remembered = rememberAsks(seen, found, now);
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  return {
    writes: [
      { kind: "document", key: "board-asks", body: asksDocument(remembered, names, now) },
      {
        kind: "wake",
        taskId: checkerTaskId,
        reason: "board_check_ask",
        key: `board-check ask ${first.commentId}`,
      },
    ],
    save: () => ctx.state.set(stateKey(companyId, "asks"), remembered),
    found: found.length,
  };
}
