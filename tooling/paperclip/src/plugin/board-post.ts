import type { PluginApiResponse } from "@paperclipai/plugin-sdk";
import { type ChiefLineApi, fail, takeSlot, wakeThread } from "./chief-line.ts";
import type { ChiefLineSettings } from "./chief-line-settings.ts";

/**
 * `POST /board/post` {issue, message}: the board's supervisor posts on any task
 * in its company, as the plugin itself (no human author, so the run it starts
 * stays on the board's seats), and the task's assignee agent is woken the
 * same way the chief line wakes Chief. At most `chiefLine.maxPerHour` posts in
 * the last hour. A done or cancelled task gets the comment only: it stays as it
 * is and nobody is woken. The board's own chats (`chiefLine.noPostTasks` and
 * "Chat with …" tasks) are refused before anything is posted (HAL-20168). The
 * caller check (board user, line on) is in src/plugin/chief-line.ts.
 */

/** The longest message `board/post` takes, in characters. */
export const boardPostMaxLength = 8000;

/** Finished statuses: a blocker in one no longer holds a task back, and a task in one is never reopened or woken. */
const resolvedStatuses = new Set(["done", "cancelled"]);

/** The title start of a person's chat with an agent, where the board never posts. */
const chatTitlePrefix = "Chat with ";

/** Why the board must not post on this task at all, or undefined when it may. */
function noPostReason(
  issue: { readonly identifier?: string | null; readonly title: string },
  settings: ChiefLineSettings,
): string | undefined {
  const identifier = issue.identifier?.toUpperCase();
  if (identifier !== undefined && settings.noPostTasks.includes(identifier)) {
    return `${issue.identifier} is the board's own chat (chiefLine.noPostTasks): nothing posted.`;
  }
  if (issue.title.startsWith(chatTitlePrefix)) {
    return `${issue.identifier ?? "The task"} is a "${chatTitlePrefix}…" chat: nothing posted.`;
  }
  return undefined;
}

/** Where the board's posts are counted against the hourly limit. */
const boardPostCounter = "board";

/** The task a board post goes to, as `boardPost` uses it. */
interface PostTarget {
  readonly id: string;
  readonly identifier: string;
  readonly status: string;
  readonly assigneeId: string;
}

/** Posts the board's message on a task as the plugin and wakes the task's assignee. */
export async function boardPost(
  ctx: ChiefLineApi,
  companyId: string,
  settings: ChiefLineSettings,
  body: Record<string, unknown>,
  now: Date,
): Promise<PluginApiResponse> {
  const { issue: ref, message } = body;
  if (typeof message !== "string" || message.trim() === "") {
    return fail(400, "message must be a non-empty string.");
  }
  if (message.length > boardPostMaxLength) {
    return fail(400, `message is longer than ${boardPostMaxLength} characters.`);
  }
  const found = await findTarget(ctx, companyId, settings, ref);
  if ("refusal" in found) {
    return found.refusal;
  }
  const { target } = found;
  const allowed = await takeSlot(
    ctx,
    companyId,
    "posts",
    boardPostCounter,
    settings.maxPerHour,
    now,
  );
  if (!allowed) {
    return fail(429, `Too many board posts: at most ${settings.maxPerHour} per hour.`);
  }
  // Posted by the plugin itself (no actorUserId): the run it starts stays on the board's seats.
  const comment = await ctx.issues.createComment(target.id, `Board: ${message}`, companyId);
  return await wakeAfterPost(ctx, companyId, target, comment.id);
}

/** The task to post on, or the refusal: not found, the board's own chat, or no assignee agent. */
async function findTarget(
  ctx: ChiefLineApi,
  companyId: string,
  settings: ChiefLineSettings,
  ref: unknown,
): Promise<{ readonly target: PostTarget } | { readonly refusal: PluginApiResponse }> {
  if (typeof ref !== "string" || ref.trim() === "") {
    return { refusal: fail(400, "issue must be a task identifier or id.") };
  }
  const issue = await ctx.issues.get(ref.trim(), companyId);
  if (issue === null || issue.companyId !== companyId) {
    return { refusal: fail(404, `No task ${ref} in this company.`) };
  }
  const refused = noPostReason(issue, settings);
  if (refused !== undefined) {
    return { refusal: fail(403, refused) };
  }
  const assigneeId = issue.assigneeAgentId;
  if (assigneeId === null || assigneeId === undefined) {
    return { refusal: fail(409, `Task ${ref} has no assignee agent to wake.`) };
  }
  const identifier = issue.identifier ?? issue.id;
  return { target: { id: issue.id, identifier, status: issue.status, assigneeId } };
}

/** After the post: wakes the assignee, unless the task is finished or still held back by its blockers. */
async function wakeAfterPost(
  ctx: ChiefLineApi,
  companyId: string,
  target: PostTarget,
  commentId: string,
): Promise<PluginApiResponse> {
  const posted = {
    issueId: target.id,
    identifier: target.identifier,
    commentId,
    assigneeAgentId: target.assigneeId,
  };
  // A finished task stays finished: reopening it on every post woke its holder for nothing (HAL-20168).
  if (resolvedStatuses.has(target.status)) {
    const note = `Task ${target.identifier} is ${target.status}: posted only, not reopened or woken.`;
    return { status: 200, body: { ...posted, woke: false, note } };
  }
  // An ordinary task's blockers are its own: leave them, say so, and don't wake (or reopen) it.
  const { blockedBy } = await ctx.issues.relations.get(target.id, companyId);
  const open = blockedBy.filter((blocker) => !resolvedStatuses.has(blocker.status));
  if (open.length > 0) {
    const ids = open.map((blocker) => blocker.identifier ?? blocker.id).join(", ");
    return {
      status: 409,
      body: {
        error: `Task ${target.identifier} is blocked by ${ids}, not woken (the post was made).`,
        issueId: target.id,
        commentId,
        blockedBy: open.map((blocker) => blocker.identifier ?? blocker.id),
        woke: false,
      },
    };
  }
  const woke = await wakeThread(ctx, companyId, target.id, commentId, { reason: "board_post" });
  return { status: 200, body: { ...posted, woke } };
}
