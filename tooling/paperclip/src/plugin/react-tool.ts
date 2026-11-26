import type {
  PluginIssuesClient,
  PluginStateClient,
  ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { readTask, ToolInputError } from "../task-tools/input.ts";
import type { MetricsApi } from "./metrics.ts";
import { agentReactionEmoji, type ReactionEmoji } from "./reaction-declarations.ts";
import { changeReaction, idPattern } from "./reactions.ts";
import { findTask, registerCounted, type TaskToolsApi } from "./task-tools.ts";

/**
 * The agents' `react` tool (HAL-19139, part 2 of the board's yes): a 👍 or 👀
 * on the person's message a run picks up, instead of a "got it" reply. The
 * no-noise rule is checked here, not left to the agent: only a person's
 * message, only 👍 or 👀, and one reaction per agent per message (a new one
 * replaces the agent's last). It writes plugin state only, so it posts no
 * comment and wakes nobody.
 */

/** The part of the plugin context the tool uses, so tests can fake it. */
export interface ReactToolApi extends MetricsApi {
  readonly tools: TaskToolsApi["tools"];
  readonly issues: Pick<PluginIssuesClient, "get" | "listComments">;
  readonly state: Pick<PluginStateClient, "get" | "set">;
}

function readParams(params: unknown): { task: string; comment: string; emoji: ReactionEmoji } {
  const task = readTask(params);
  const { comment, emoji } = (params ?? {}) as { comment?: unknown; emoji?: unknown };
  if (typeof comment !== "string" || !idPattern.test(comment)) {
    throw new ToolInputError("comment must be the id of the person's comment.");
  }
  const allowed = agentReactionEmoji.find((one) => one === emoji);
  if (allowed === undefined) {
    throw new ToolInputError(`emoji must be ${agentReactionEmoji.join(" or ")}.`);
  }
  return { task, comment, emoji: allowed };
}

async function react(ctx: ReactToolApi, params: unknown, runCtx: ToolRunContext) {
  const { task, comment, emoji } = readParams(params);
  const issue = await findTask(ctx, task, runCtx.companyId);
  const comments = await ctx.issues.listComments(issue.id, runCtx.companyId);
  const found = comments.find((entry) => entry.id === comment);
  const identifier = issue.identifier ?? issue.id;
  if (found === undefined) {
    throw new ToolInputError(`no comment ${comment} on ${identifier}.`);
  }
  if (found.authorUserId === null || found.authorAgentId !== null) {
    throw new ToolInputError("react only to a person's message, never to an agent's.");
  }
  await changeReaction(ctx.state, runCtx.companyId, issue.id, comment, {
    by: { kind: "agent", id: runCtx.agentId },
    emoji,
    on: true,
    onlyOne: true,
    at: new Date().toISOString(),
  });
  return {
    content: `Reacted ${emoji} to the message on ${identifier}, as you. It wakes nobody; a question still needs a written answer.`,
    data: { task: identifier, commentId: comment, emoji },
  };
}

/** Registers `react` as the manifest declares it, each call counted. */
export function registerReactTool(ctx: ReactToolApi): void {
  registerCounted(ctx, { react });
}
