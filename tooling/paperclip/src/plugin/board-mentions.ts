import type {
  PluginApiRequestInput,
  PluginApiResponse,
  PluginEvent,
  PluginIssuesClient,
  PluginLogger,
  PluginStateClient,
} from "@paperclipai/plugin-sdk";
import { type Serial, serial } from "./front-bot-budget.ts";

/**
 * Comments that mention a person, for Halonic's Inbox (`paperclip.board-mentions`, HAL-19669).
 * Paperclip records a mention only as the link its mention picker writes into the comment,
 * `[Name](user://<userId>)`, and reads it the same way for its own Inbox and toasts. Paperclip
 * has no read for "comments that mention me", so the plugin reads that link from each new comment
 * and keeps an index: ids and times only, never the text. A name or "the board" in plain text is
 * never a mention.
 */

/** The route's key, as the manifest declares it. */
export const boardMentionsRouteKey = "board-mentions";

/** How long a mention stays in the index and on the route. */
export const mentionDays = 14;
const keptMs = mentionDays * 24 * 60 * 60_000;
/** The most mentions the route answers. */
export const mostMentions = 100;
/** The most mentions the index keeps per company; the oldest drop out first. */
const keptMentions = 2_000;
/** The most of a comment's text the route sends; Halonic shows only its first lines. */
const sentChars = 2_000;

/** A mention in the index. */
export interface IndexedMention {
  readonly commentId: string;
  readonly taskId: string;
  readonly userIds: readonly string[];
  readonly at: string;
}

/** What the plugin needs from its host. */
export interface BoardMentionsApi {
  readonly state: Pick<PluginStateClient, "get" | "set">;
  readonly issues: Pick<PluginIssuesClient, "get" | "listComments">;
  readonly logger: Pick<PluginLogger, "error">;
}

/** A comment as the plugin reads it; the host may send its time as a `Date` or a string. */
interface CommentLike {
  readonly id: string;
  readonly body: string;
  readonly authorAgentId: string | null;
  readonly authorUserId: string | null;
  readonly createdAt: Date | string;
}

/** Statuses of a task that is closed: its mentions leave the route. */
const closedStatuses = new Set(["done", "cancelled"]);

/** A Markdown link whose target uses Paperclip's `user:` scheme. */
const userLink = /\[[^\]]*\]\((user:[^)\s]+)\)/g;

/**
 * The ids of the people `markdown` mentions, read the way Paperclip reads its own links
 * (`extractUserMentionIds` in Paperclip's shared package): the host and path of a `user://` link.
 */
export function mentionedUserIds(markdown: string): string[] {
  const ids = new Set<string>();
  for (const [, href = ""] of markdown.matchAll(userLink)) {
    if (!href.startsWith("user://")) continue;
    try {
      const url = new URL(href);
      const id = `${url.hostname}${url.pathname}`.replace(/^\/+/, "").trim();
      if (id !== "") ids.add(id);
    } catch {
      // Not a link Paperclip can read either, so no mention.
    }
  }
  return [...ids];
}

function indexKey(companyId: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "board-mentions",
    stateKey: "index",
  } as const;
}

function isoOf(value: Date | string): string {
  return new Date(value).toISOString();
}

async function readIndex(api: BoardMentionsApi, companyId: string): Promise<IndexedMention[]> {
  const record = (await api.state.get(indexKey(companyId))) as {
    mentions?: IndexedMention[];
  } | null;
  return record?.mentions ?? [];
}

/** Keeps track of new comments that mention someone; one index change at a time. */
export function boardMentions(api: BoardMentionsApi, queue: Serial = serial()) {
  return {
    /** Reads the new comment and, when it mentions someone, adds it to the index; logs, never throws. */
    async onCommentCreated(event: PluginEvent, now: Date): Promise<void> {
      try {
        await remember(event, now);
      } catch (error) {
        api.logger.error("Board mentions: couldn't read a new comment.", {
          companyId: event.companyId,
          error: (error as Error).name,
        });
      }
    },
  };

  async function remember(event: PluginEvent, now: Date): Promise<void> {
    const payload = (event.payload ?? {}) as { issueId?: unknown; commentId?: unknown };
    const taskId = typeof payload.issueId === "string" ? payload.issueId : event.entityId;
    const commentId = payload.commentId;
    if (taskId === undefined || typeof commentId !== "string") return;
    // The event's snippet is cut short, so the mention can be past it: read the whole comment.
    const comments = (await api.issues.listComments(taskId, event.companyId)) as CommentLike[];
    const comment = comments.find((candidate) => candidate.id === commentId);
    const userIds = comment === undefined ? [] : mentionedUserIds(comment.body);
    if (comment === undefined || userIds.length === 0) return;
    const mention = { commentId, taskId, userIds, at: isoOf(comment.createdAt) };
    await queue(async () => {
      const since = now.getTime() - keptMs;
      const kept = (await readIndex(api, event.companyId)).filter(
        (entry) => Date.parse(entry.at) >= since && entry.commentId !== commentId,
      );
      const mentions = [...kept, mention].slice(-keptMentions);
      await api.state.set(indexKey(event.companyId), { mentions });
    });
  }
}

/** The signed-in person a request comes from, or `undefined` for an agent's key. */
function boardUser(input: PluginApiRequestInput): string | undefined {
  const userId = input.actor.actorType === "user" ? input.actor.userId : undefined;
  return typeof userId === "string" && userId !== "" ? userId : undefined;
}

/** The time `since` asks for, but never more than {@link mentionDays} back. */
function sinceOf(input: PluginApiRequestInput, now: Date): number {
  const earliest = now.getTime() - keptMs;
  const asked = Date.parse(String(input.query["since"] ?? ""));
  return Number.isNaN(asked) ? earliest : Math.max(asked, earliest);
}

/**
 * Answers `GET /board/mentions?since=<iso>`, board only: the comments on open tasks that mention
 * the calling person, newest first, at most {@link mostMentions}, with when that person last
 * commented on the task (`repliedAt`, `null` if never), so Halonic can drop a mention they answered.
 */
export async function handleBoardMentions(
  input: PluginApiRequestInput,
  api: BoardMentionsApi,
  now: Date = new Date(),
): Promise<PluginApiResponse> {
  const userId = boardUser(input);
  if (userId === undefined) {
    return { status: 403, body: { error: "Only a signed-in person can read their mentions." } };
  }
  const since = sinceOf(input, now);
  const mine = (await readIndex(api, input.companyId))
    .filter((entry) => entry.userIds.includes(userId) && Date.parse(entry.at) >= since)
    .sort((left, right) => right.at.localeCompare(left.at));
  const mentions: Record<string, unknown>[] = [];
  const commentsOf = new Map<string, CommentLike[]>();
  for (const entry of mine) {
    if (mentions.length >= mostMentions) break;
    const task = await api.issues.get(entry.taskId, input.companyId);
    if (task === null || closedStatuses.has(task.status)) continue;
    const comments =
      commentsOf.get(entry.taskId) ??
      ((await api.issues.listComments(entry.taskId, input.companyId)) as CommentLike[]);
    commentsOf.set(entry.taskId, comments);
    const comment = comments.find((candidate) => candidate.id === entry.commentId);
    // A comment the person wrote themselves is no mention for them.
    if (comment === undefined || comment.authorUserId === userId) continue;
    const replies = comments.filter((candidate) => candidate.authorUserId === userId);
    const repliedAt =
      replies
        .map((reply) => isoOf(reply.createdAt))
        .sort()
        .at(-1) ?? null;
    mentions.push({
      commentId: comment.id,
      taskId: task.id,
      identifier: task.identifier,
      title: task.title,
      body: comment.body.slice(0, sentChars),
      authorAgentId: comment.authorAgentId,
      authorUserId: comment.authorUserId,
      createdAt: isoOf(comment.createdAt),
      repliedAt,
    });
  }
  return { status: 200, body: { mentions } };
}
