import type {
  Issue,
  PluginIssuesClient,
  PluginToolsClient,
  ToolResult,
  ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { readTask, ToolInputError } from "../task-tools/input.ts";
import { manifest } from "./manifest.ts";
import { type MetricsApi, writeMetrics } from "./metrics.ts";

/**
 * The task tool `comment` (HAL-16403, B2 in the tools plan on HAL-15920):
 * one call instead of a curl request to Paperclip's API. It posts one comment
 * with the calling agent as its author and doesn't change a task's status,
 * holder or monitor: `set_next_step` and `finish_run` do, in next-step-tools.ts.
 * `task_get` moved to the workspace plugin (HAL-17968).
 */

/** The part of the plugin context the task tools use, so tests can fake it. */
export interface TaskToolsApi extends MetricsApi {
  readonly tools: Pick<PluginToolsClient, "register">;
  readonly issues: Pick<PluginIssuesClient, "get" | "createComment">;
}

/** The longest comment `comment` posts; a longer one belongs in a document. */
export const maxCommentLength = 20_000;

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

/** The task by identifier or id; throws a `ToolInputError` when the plugin can't find it. */
export async function findTask(
  ctx: { readonly issues: Pick<PluginIssuesClient, "get"> },
  task: string,
  companyId: string,
): Promise<Issue> {
  const issue = await ctx.issues.get(task, companyId);
  if (issue === null) {
    throw new ToolInputError(`no task ${task} in this company, or the plugin may not read it.`);
  }
  return issue;
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

/** A task tool's handler: a thrown `ToolInputError` goes back to the agent as it is. */
export type TaskToolHandler<Api> = (
  ctx: Api,
  params: unknown,
  runCtx: ToolRunContext,
) => Promise<ToolResult>;

/** Registers each handler as the manifest declares it, each call counted by tool and outcome. */
export function registerCounted<Api extends MetricsApi & { readonly tools: TaskToolsApi["tools"] }>(
  ctx: Api,
  handlers: Readonly<Record<string, TaskToolHandler<Api>>>,
): void {
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

/** Registers `comment` as the manifest declares it, each call counted. */
export function registerTaskTools(ctx: TaskToolsApi): void {
  registerCounted(ctx, { comment });
}
