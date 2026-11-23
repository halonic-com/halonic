import type {
  Issue,
  PluginAgentsClient,
  PluginIssuesClient,
  PluginToolsClient,
  ToolResult,
  ToolRunContext,
} from "@paperclipai/plugin-sdk";
import {
  type CommentView,
  limits,
  shownView,
  type TaskRef,
  type TaskView,
  taskText,
} from "../task-tools/task-view.ts";
import { manifest } from "./manifest.ts";
import { type MetricsApi, writeMetrics } from "./metrics.ts";

/**
 * The task tools `task_get` and `comment` (HAL-16403, B2 in the tools plan
 * on HAL-15920): one call each instead of a chain of curl requests to
 * Paperclip's API. `task_get` only reads; `comment` posts one comment with
 * the calling agent as its author. Neither changes a task's status, holder or
 * monitor.
 */

/** The part of the plugin context the task tools use, so tests can fake it. */
export interface TaskToolsApi extends MetricsApi {
  readonly tools: Pick<PluginToolsClient, "register">;
  readonly agents: Pick<PluginAgentsClient, "list">;
  readonly issues: Pick<PluginIssuesClient, "get" | "listComments" | "createComment"> & {
    readonly relations: Pick<PluginIssuesClient["relations"], "get">;
    readonly documents: Pick<PluginIssuesClient["documents"], "list" | "get">;
  };
}

/** The longest comment `comment` posts; a longer one belongs in a document. */
export const maxCommentLength = 20_000;

/** A mistake in the agent's parameters: its message goes back to the agent as it is. */
class ToolInputError extends Error {}

const taskPattern = /^[A-Z][A-Z0-9]*-\d+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `task` as an identifier such as HAL-16403 or a task id; throws for anything else. */
export function readTask(params: unknown): string {
  const { task } = (params ?? {}) as { task?: unknown };
  const value = typeof task === "string" ? task.trim() : "";
  if (!(taskPattern.test(value) || uuidPattern.test(value))) {
    throw new ToolInputError("task must be a task identifier, such as HAL-16403, or its id.");
  }
  return value;
}

/** `task_get`'s parameters: the task, how many comments, and an optional document key. */
export function readTaskGetParams(params: unknown): {
  task: string;
  comments: number;
  document?: string;
} {
  const task = readTask(params);
  const { comments, document } = (params ?? {}) as { comments?: unknown; document?: unknown };
  const count = comments ?? limits.defaultComments;
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > limits.maxComments
  ) {
    throw new ToolInputError(`comments must be a whole number from 0 to ${limits.maxComments}.`);
  }
  if (document === undefined || document === null || document === "") {
    return { task, comments: count };
  }
  if (typeof document !== "string") {
    throw new ToolInputError("document must be a document key, such as plan.");
  }
  return { task, comments: count, document };
}

/** `comment`'s parameters: the task and a body that isn't empty or too long. */
export function readCommentParams(params: unknown): { task: string; body: string } {
  const task = readTask(params);
  const { body } = (params ?? {}) as { body?: unknown };
  if (typeof body !== "string" || body.trim() === "") {
    throw new ToolInputError("body must be the comment's text.");
  }
  if (body.length > maxCommentLength) {
    throw new ToolInputError(
      `body is ${body.length} characters; the most is ${maxCommentLength}. Put a longer text in a document.`,
    );
  }
  return { task, body };
}

function iso(value: Date | string | null | undefined): string | null {
  return value == null ? null : new Date(value).toISOString();
}

async function findTask(ctx: TaskToolsApi, task: string, companyId: string): Promise<Issue> {
  const issue = await ctx.issues.get(task, companyId);
  if (issue === null) {
    throw new ToolInputError(`no task ${task} in this company, or the plugin may not read it.`);
  }
  return issue;
}

async function refTo(ctx: TaskToolsApi, id: string, companyId: string): Promise<TaskRef | null> {
  const issue = await ctx.issues.get(id, companyId);
  return issue === null ? null : { identifier: issue.identifier ?? issue.id, status: issue.status };
}

/** Reads the task, its parent, blockers, documents and comments into one view. */
async function readView(
  ctx: TaskToolsApi,
  companyId: string,
  params: ReturnType<typeof readTaskGetParams>,
): Promise<TaskView> {
  const issue = await findTask(ctx, params.task, companyId);
  const [agents, relations, documents, comments, parent, document] = await Promise.all([
    ctx.agents.list({ companyId, limit: 500 }),
    ctx.issues.relations.get(issue.id, companyId),
    ctx.issues.documents.list(issue.id, companyId),
    ctx.issues.listComments(issue.id, companyId),
    issue.parentId === null ? null : refTo(ctx, issue.parentId, companyId),
    params.document === undefined
      ? undefined
      : ctx.issues.documents.get(issue.id, params.document, companyId),
  ]);
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  const author = (agentId: string | null, userId: string | null) => {
    if (agentId !== null) {
      return names.get(agentId) ?? agentId;
    }
    return userId !== null ? "board" : "Paperclip";
  };
  return {
    identifier: issue.identifier ?? issue.id,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    holder:
      issue.assigneeAgentId === null && issue.assigneeUserId === null
        ? null
        : author(issue.assigneeAgentId, issue.assigneeUserId),
    parent,
    blockedBy: relations.blockedBy.map((blocker) => ({
      identifier: blocker.identifier ?? blocker.id,
      status: blocker.status,
    })),
    monitorNextCheckAt: iso(issue.monitorNextCheckAt),
    description: issue.description ?? "",
    documents: documents.map((summary) => ({
      key: summary.key,
      title: summary.title,
      updatedAt: iso(summary.updatedAt) ?? "",
    })),
    comments: comments
      .map(
        (comment): CommentView => ({
          id: comment.id,
          author: author(comment.authorAgentId, comment.authorUserId),
          createdAt: iso(comment.createdAt) ?? "",
          body: comment.body,
        }),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    ...(document === undefined
      ? {}
      : { document: document === null ? null : { key: document.key, body: document.body } }),
  };
}

async function taskGet(ctx: TaskToolsApi, params: unknown, runCtx: ToolRunContext) {
  const read = readTaskGetParams(params);
  const view = await readView(ctx, runCtx.companyId, read);
  const shown = shownView(view, read.comments);
  return { content: taskText(shown), data: shown };
}

async function comment(ctx: TaskToolsApi, params: unknown, runCtx: ToolRunContext) {
  const { task, body } = readCommentParams(params);
  const issue = await findTask(ctx, task, runCtx.companyId);
  const posted = await ctx.issues.createComment(issue.id, body, runCtx.companyId, {
    authorAgentId: runCtx.agentId,
  });
  const identifier = issue.identifier ?? issue.id;
  return {
    content: `Posted comment ${posted.id} on ${identifier}, as you. It wakes nobody: to hand the task on, assign it.`,
    data: { task: identifier, commentId: posted.id },
  };
}

const handlers = { task_get: taskGet, comment } as const;

/** Registers `task_get` and `comment` as the manifest declares them, each call counted. */
export function registerTaskTools(ctx: TaskToolsApi): void {
  for (const [name, handler] of Object.entries(handlers)) {
    const declaration = manifest.tools?.find((tool) => tool.name === name);
    if (declaration === undefined) {
      throw new Error(`Agent tools: the manifest doesn't declare ${name}.`);
    }
    ctx.tools.register(name, declaration, async (params: unknown, runCtx: ToolRunContext) => {
      let result: ToolResult;
      try {
        result = await handler(ctx, params, runCtx);
      } catch (error) {
        const message =
          error instanceof ToolInputError
            ? error.message
            : `Paperclip refused: ${(error as Error).message}`;
        result = { error: `${name}: ${message}` };
      }
      await writeMetrics(
        ctx,
        { "tools.calls": 1 },
        {
          companyId: runCtx.companyId,
          tool: name,
          outcome: result.error === undefined ? "ok" : "error",
        },
      );
      return result;
    });
  }
}
