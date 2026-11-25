import type { PluginApiResponse } from "@paperclipai/plugin-sdk";
import { type ChiefLineApi, fail, takeSlot, wakeThread } from "./chief-line.ts";
import type { ChiefLineSettings } from "./chief-line-settings.ts";

/**
 * `POST /board/post` {issue, message}: the board's supervisor posts on any task
 * in its company, as the plugin itself (no human author, so the run it starts
 * stays on the board's seats), and the task's assignee agent is woken the
 * same way the chief line wakes Chief. At most `chiefLine.maxPerHour` posts in
 * the last hour. The caller check (board user, line on) is in
 * src/plugin/chief-line.ts.
 */

/** The longest message `board/post` takes, in characters. */
export const boardPostMaxLength = 8000;

/** Blocker statuses that no longer hold a task back. */
const resolvedStatuses = new Set(["done", "cancelled"]);

/** Where the board's posts are counted against the hourly limit. */
const boardPostCounter = "board";

/** Posts the board's message on a task as the plugin and wakes the task's assignee. */
export async function boardPost(
  ctx: ChiefLineApi,
  companyId: string,
  settings: ChiefLineSettings,
  body: Record<string, unknown>,
  now: Date,
): Promise<PluginApiResponse> {
  const { issue: ref, message } = body;
  if (typeof ref !== "string" || ref.trim() === "") {
    return fail(400, "issue must be a task identifier or id.");
  }
  if (typeof message !== "string" || message.trim() === "") {
    return fail(400, "message must be a non-empty string.");
  }
  if (message.length > boardPostMaxLength) {
    return fail(400, `message is longer than ${boardPostMaxLength} characters.`);
  }
  const issue = await ctx.issues.get(ref.trim(), companyId);
  if (issue === null || issue.companyId !== companyId) {
    return fail(404, `No task ${ref} in this company.`);
  }
  const assigneeId = issue.assigneeAgentId;
  if (assigneeId === null || assigneeId === undefined) {
    return fail(409, `Task ${ref} has no assignee agent to wake.`);
  }
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
  const comment = await ctx.issues.createComment(issue.id, `Board: ${message}`, companyId);
  // An ordinary task's blockers are its own: leave them, say so, and don't wake (or reopen) it.
  const { blockedBy } = await ctx.issues.relations.get(issue.id, companyId);
  const open = blockedBy.filter((blocker) => !resolvedStatuses.has(blocker.status));
  if (open.length > 0) {
    const ids = open.map((blocker) => blocker.identifier ?? blocker.id).join(", ");
    return {
      status: 409,
      body: {
        error: `Task ${issue.identifier ?? issue.id} is blocked by ${ids}, not woken (the post was made).`,
        issueId: issue.id,
        commentId: comment.id,
        blockedBy: open.map((blocker) => blocker.identifier ?? blocker.id),
        woke: false,
      },
    };
  }
  const woke = await wakeThread(ctx, companyId, issue.id, comment.id, { reason: "board_post" });
  return {
    status: 200,
    body: {
      issueId: issue.id,
      identifier: issue.identifier ?? issue.id,
      commentId: comment.id,
      assigneeAgentId: assigneeId,
      woke,
    },
  };
}
