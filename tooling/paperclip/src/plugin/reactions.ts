import type {
  PluginApiRequestInput,
  PluginApiResponse,
  PluginIssuesClient,
  PluginStateClient,
} from "@paperclipai/plugin-sdk";
import { type ReactionEmoji, reactionEmoji } from "./reaction-declarations.ts";

/**
 * Messenger reactions (HAL-19139, the board's yes on 26 Nov). Paperclip's
 * comments have no reactions, so the plugin keeps them per task in its own
 * state until Paperclip has native ones. A reaction is never a comment: it
 * wakes nobody, starts no event handler and never counts as unread. Messenger
 * reads a chat's reactions and toggles the person's own on the two board-only
 * routes here; agents add theirs with the `react` tool (react-tool.ts).
 */

/** Who reacted: the signed-in person, or an agent. */
export interface Reactor {
  readonly kind: "user" | "agent";
  readonly id: string;
}

/** One reaction on one comment. */
export interface Reaction {
  readonly emoji: ReactionEmoji;
  readonly by: Reactor;
  readonly at: string;
}

/** A task's reactions by comment id; a comment without reactions isn't listed. */
export type CommentReactions = Readonly<Record<string, readonly Reaction[]>>;

/** What the plugin keeps per task. */
interface ReactionsRecord {
  readonly companyId: string;
  readonly comments: CommentReactions;
}

/** One change to one comment's reactions. */
export interface ReactionChange {
  readonly by: Reactor;
  readonly emoji: ReactionEmoji;
  /** `true` adds the reaction, `false` removes it. */
  readonly on: boolean;
  /** Replaces the reactor's other reactions on the comment: an agent keeps one per message. */
  readonly onlyOne: boolean;
  readonly at: string;
}

type StateGet = Pick<PluginStateClient, "get">;
type StateGetSet = Pick<PluginStateClient, "get" | "set">;

function reactionsKey(taskId: string) {
  return {
    scopeKind: "issue",
    scopeId: taskId,
    namespace: "reactions",
    stateKey: "comments",
  } as const;
}

/** A task's reactions in this company; none for a task of another company. */
export async function taskReactions(
  state: StateGet,
  companyId: string,
  taskId: string,
): Promise<CommentReactions> {
  const record = (await state.get(reactionsKey(taskId))) as ReactionsRecord | null;
  return record !== null && record.companyId === companyId ? record.comments : {};
}

const sameReactor = (one: Reactor, other: Reactor) =>
  one.kind === other.kind && one.id === other.id;

/** A comment's reactions after a change; adding one the reactor already has changes nothing. */
export function applyReaction(
  reactions: readonly Reaction[],
  change: ReactionChange,
): readonly Reaction[] {
  const mine = (reaction: Reaction) => sameReactor(reaction.by, change.by);
  if (!change.on) {
    return reactions.filter((reaction) => !(mine(reaction) && reaction.emoji === change.emoji));
  }
  if (reactions.some((reaction) => mine(reaction) && reaction.emoji === change.emoji)) {
    return reactions;
  }
  const kept = change.onlyOne ? reactions.filter((reaction) => !mine(reaction)) : reactions;
  return [...kept, { emoji: change.emoji, by: change.by, at: change.at }];
}

/**
 * Applies a change to one comment and saves the task's reactions. Two changes
 * on one task at the same moment can lose one, as with the front bot's notes:
 * a person and a few agents rarely react to one chat in the same instant.
 */
export async function changeReaction(
  state: StateGetSet,
  companyId: string,
  taskId: string,
  commentId: string,
  change: ReactionChange,
): Promise<readonly Reaction[]> {
  const comments = { ...(await taskReactions(state, companyId, taskId)) };
  const reactions = applyReaction(comments[commentId] ?? [], change);
  if (reactions.length === 0) {
    delete comments[commentId];
  } else {
    comments[commentId] = reactions;
  }
  await state.set(reactionsKey(taskId), { companyId, comments });
  return reactions;
}

/** Paperclip's task and comment ids are UUIDs; anything else is refused before reading state. */
export const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` is one of the six emoji. */
export function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return reactionEmoji.some((emoji) => emoji === value);
}

/** The part of the plugin context the routes use, so tests can fake it. */
export interface ReactionRoutesApi {
  readonly state: StateGetSet;
  readonly issues: Pick<PluginIssuesClient, "get" | "listComments">;
}

function refuse(status: number, message: string): PluginApiResponse {
  return { status, body: { error: message } };
}

function boardUser(input: PluginApiRequestInput): string | undefined {
  const userId = input.actor.actorType === "user" ? input.actor.userId : undefined;
  return typeof userId === "string" && userId !== "" ? userId : undefined;
}

/** Answers `GET /reactions/{taskId}`, board only: `{ reactions }` by comment id. */
export async function handleReactionsRead(
  input: PluginApiRequestInput,
  ctx: Pick<ReactionRoutesApi, "state">,
): Promise<PluginApiResponse> {
  if (boardUser(input) === undefined) {
    return refuse(403, "Only the board can read a chat's reactions.");
  }
  const taskId = input.params["taskId"] ?? "";
  if (!idPattern.test(taskId)) {
    return refuse(404, "No such task.");
  }
  return {
    status: 200,
    body: { reactions: await taskReactions(ctx.state, input.companyId, taskId) },
  };
}

interface WriteBody {
  readonly commentId: string;
  readonly emoji: ReactionEmoji;
  readonly on: boolean;
}

function readWriteBody(body: unknown): WriteBody | undefined {
  const { commentId, emoji, on } = (body ?? {}) as Record<string, unknown>;
  if (typeof commentId !== "string" || !idPattern.test(commentId)) {
    return undefined;
  }
  if (!isReactionEmoji(emoji) || typeof on !== "boolean") {
    return undefined;
  }
  return { commentId, emoji, on };
}

/**
 * Answers `POST /reactions/{taskId}` with `{ commentId, emoji, on }`, board
 * only: adds or removes the signed-in person's reaction on a comment of that
 * task and answers `{ commentId, reactions }` with the comment's reactions.
 */
export async function handleReactionsWrite(
  input: PluginApiRequestInput,
  ctx: ReactionRoutesApi,
  now: Date,
): Promise<PluginApiResponse> {
  const userId = boardUser(input);
  if (userId === undefined) {
    return refuse(403, "Only the board can react on this route; agents use the react tool.");
  }
  const taskId = input.params["taskId"] ?? "";
  const body = readWriteBody(input.body);
  if (body === undefined) {
    return refuse(400, `Send { "commentId", "emoji": one of ${reactionEmoji.join(" ")}, "on" }.`);
  }
  const task = idPattern.test(taskId) ? await ctx.issues.get(taskId, input.companyId) : null;
  if (task === null) {
    return refuse(404, "No such task.");
  }
  const comments = await ctx.issues.listComments(task.id, input.companyId);
  if (!comments.some((comment) => comment.id === body.commentId)) {
    return refuse(404, "No such message on this task.");
  }
  const reactions = await changeReaction(ctx.state, input.companyId, task.id, body.commentId, {
    by: { kind: "user", id: userId },
    emoji: body.emoji,
    on: body.on,
    onlyOne: false,
    at: now.toISOString(),
  });
  return { status: 200, body: { commentId: body.commentId, reactions } };
}
