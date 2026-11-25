import type { ActionCall, ActionHandler } from "../handlers.ts";
import type { PaperclipTask, ToolResult } from "../host.ts";
import type { PaperclipAccess } from "../paperclip-access.ts";
import {
  type CommentView,
  limits,
  shownView,
  type TaskRef,
  type TaskView,
  taskText,
} from "./task-view.ts";

/**
 * The `paperclip.task` action: one task with its parent, blockers, documents
 * and newest comments, read through Paperclip's own clients. Read-only.
 * Ported from `tooling/paperclip`'s `task_get` (`plugin/task-tools.ts`,
 * `task-tools/input.ts`), with the same parameters, refusals and limits.
 */

/** A mistake in the agent's parameters: its message goes back to the agent as it is. */
class TaskInputError extends Error {}

const taskPattern = /^[A-Z][A-Z0-9]*-\d+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the agent asked for: the task, how many comments, and an optional document key. */
interface TaskParams {
  readonly task: string;
  readonly comments: number;
  readonly document?: string;
}

/** `task` as an identifier such as HAL-16403 or a task id; throws for anything else. */
function readTask(params: unknown): string {
  const { task } = (params ?? {}) as { task?: unknown };
  const value = typeof task === "string" ? task.trim() : "";
  if (!taskPattern.test(value) && !uuidPattern.test(value)) {
    throw new TaskInputError("task must be a task identifier, such as HAL-16403, or its id.");
  }
  return value;
}

/** The action's parameters, checked before anything is read. */
function readTaskParams(params: unknown): TaskParams {
  const task = readTask(params);
  const { comments, document } = (params ?? {}) as { comments?: unknown; document?: unknown };
  const count = comments ?? limits.defaultComments;
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > limits.maxComments
  ) {
    throw new TaskInputError(`comments must be a whole number from 0 to ${limits.maxComments}.`);
  }
  if (document === undefined || document === null || document === "") {
    return { task, comments: count };
  }
  if (typeof document !== "string") {
    throw new TaskInputError("document must be a document key, such as plan.");
  }
  return { task, comments: count, document };
}

type PaperclipReads = Pick<PaperclipAccess, "agents" | "issues">;

function iso(value: Date | string | null | undefined): string | null {
  return value == null ? null : new Date(value).toISOString();
}

/** The task by identifier or id; a task the plugin can't find is the agent's mistake. */
async function findTask(
  paperclip: PaperclipReads,
  task: string,
  companyId: string,
): Promise<PaperclipTask> {
  const issue = await paperclip.issues.get(task, companyId);
  if (issue === null) {
    throw new TaskInputError(`no task ${task} in this company, or the plugin may not read it.`);
  }
  return issue;
}

async function refTo(
  paperclip: PaperclipReads,
  id: string,
  companyId: string,
): Promise<TaskRef | null> {
  const issue = await paperclip.issues.get(id, companyId);
  return issue === null ? null : { identifier: issue.identifier ?? issue.id, status: issue.status };
}

/** Reads the task, its parent, blockers, documents and comments into one view. */
async function readView(
  paperclip: PaperclipReads,
  companyId: string,
  params: TaskParams,
): Promise<TaskView> {
  const { issues } = paperclip;
  const issue = await findTask(paperclip, params.task, companyId);
  const [agents, relations, documents, comments, parent, document] = await Promise.all([
    paperclip.agents.list({ companyId, limit: 500 }),
    issues.relations.get(issue.id, companyId),
    issues.documents.list(issue.id, companyId),
    issues.listComments(issue.id, companyId),
    issue.parentId === null ? null : refTo(paperclip, issue.parentId, companyId),
    params.document === undefined
      ? undefined
      : issues.documents.get(issue.id, params.document, companyId),
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

async function taskAnswer({ params, paperclip, companyId }: ActionCall): Promise<ToolResult> {
  const read = readTaskParams(params);
  const shown = shownView(await readView(paperclip, companyId, read), read.comments);
  return { content: taskText(shown), data: shown };
}

/**
 * Reads one task. A mistake in the parameters goes back as it is, before
 * anything is read; anything Paperclip refuses says so, as `task_get` does.
 */
export const taskHandler: ActionHandler = {
  capabilities: [
    "issues.read",
    "issue.comments.read",
    "issue.documents.read",
    "issue.relations.read",
    "agents.read",
  ],
  run: async (call) => {
    const { tool } = call;
    if (tool.action.run !== "paperclip.task") {
      return { error: `${tool.name}: runs ${tool.action.run}, not paperclip.task.` };
    }
    try {
      return await taskAnswer(call);
    } catch (error) {
      const message =
        error instanceof TaskInputError
          ? error.message
          : `Paperclip refused: ${(error as Error).message}`;
      return { error: `${tool.name}: ${message}` };
    }
  },
};
