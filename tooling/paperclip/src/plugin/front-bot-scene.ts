import type { IssueComment } from "@paperclipai/plugin-sdk";
import type { FrontBotReason } from "../front-bot/log-record.ts";
import type { FrontBotInput } from "../front-bot/prompt.ts";
import { holdsSecretShape } from "../front-bot/secret-shape.ts";
import type { FrontBotApi } from "./front-bot.ts";
import { automaticNoteIds, isAutomaticNote } from "./front-bot-notes.ts";

/**
 * What the front bot reads of a chat task before it decides (HAL-19136,
 * design on HAL-18847 section 4.2): the task, the board user's message and
 * the comments before it, never the bot's own comments or anything shaped
 * like a key.
 */

type Issue = NonNullable<Awaited<ReturnType<FrontBotApi["issues"]["get"]>>>;

/** What the bot reads before it decides: the task, the person's message and the comments around it. */
export interface Scene {
  readonly issue: Issue;
  readonly agentId: string;
  readonly message: IssueComment;
  readonly before: readonly IssueComment[];
  readonly ownIds: ReadonlySet<string>;
}

/** The chat task and a board user's message on it, or undefined when the message is out of scope. */
export async function sceneOf(
  ctx: FrontBotApi,
  companyId: string,
  taskId: string,
  commentId: string | undefined,
) {
  const issue = await ctx.issues.get(taskId, companyId);
  const agentId = issue?.conversationAgentId ?? null;
  if (issue === null || issue.companyId !== companyId || agentId === null) {
    return undefined;
  }
  const comments = await ctx.issues.listComments(issue.id, companyId);
  const index =
    commentId === undefined ? comments.length - 1 : comments.findIndex((c) => c.id === commentId);
  const message = comments[index];
  const ownIds = await automaticNoteIds(ctx.state, companyId, issue.id);
  // Only a person's message: never an agent's, never a plugin's or Paperclip's, never the bot's own.
  if (message === undefined || message.authorAgentId !== null || message.authorUserId === null) {
    return undefined;
  }
  if (isAutomaticNote(message, ownIds)) {
    return undefined;
  }
  return { issue, agentId, message, before: comments.slice(0, index), ownIds } satisfies Scene;
}

/** Whether the chat's agent wrote after the message: then the bot stays quiet for good. */
export async function agentAnswered(ctx: FrontBotApi, scene: Scene): Promise<boolean> {
  const comments = await ctx.issues.listComments(scene.issue.id, scene.issue.companyId);
  const sentAt = new Date(scene.message.createdAt).getTime();
  return comments.some(
    (comment) =>
      comment.authorAgentId === scene.agentId && new Date(comment.createdAt).getTime() >= sentAt,
  );
}

/** The input the bot sends: the bot's own comments and anything shaped like a key left out. */
export async function inputOf(ctx: FrontBotApi, scene: Scene): Promise<FrontBotInput> {
  const agents = await ctx.agents.list({ companyId: scene.issue.companyId, limit: 500 });
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  const earlier = scene.before
    .filter((comment) => !isAutomaticNote(comment, scene.ownIds) && !holdsSecretShape(comment.body))
    .map((comment) => ({
      author:
        comment.authorAgentId === null ? "board" : (names.get(comment.authorAgentId) ?? "an agent"),
      at: new Date(comment.createdAt),
      body: comment.body,
    }));
  return {
    title: scene.issue.title,
    message: scene.message.body,
    messageAt: new Date(scene.message.createdAt),
    earlier,
  };
}

/** Why the bot makes no call before it reads its limits, or undefined when it may. */
export function inputBlock(scene: Scene): FrontBotReason | undefined {
  const secret = holdsSecretShape(scene.message.body) || holdsSecretShape(scene.issue.title);
  return secret ? "secret_in_input" : undefined;
}
