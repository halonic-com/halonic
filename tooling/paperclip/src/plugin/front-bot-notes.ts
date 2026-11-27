import type {
  PluginApiRequestInput,
  PluginApiResponse,
  PluginIssuesClient,
  PluginStateClient,
} from "@paperclipai/plugin-sdk";
import { automaticAnswerStart } from "../front-bot/lookups.ts";
import { assistantLabel, automaticNotePrefix } from "../front-bot/prompt.ts";

/**
 * The front bot's list of its own comments (HAL-18847 section 2.2). A plugin
 * can't mark a comment in its metadata, so the bot keeps the ids of what it
 * posted, per task, and serves them on a read-only board route that Messenger
 * keys on. chief-line, board-check and the PR watcher skip the same ids, so a
 * bot comment never starts an action or counts as a comment (section 7, point 3).
 */

/** The route's key, as the manifest declares it. */
export const chatNotesRouteKey = "chat-notes";

/**
 * The memory route's keys (HAL-19597, front-bot-memory.ts), kept here so the
 * manifest imports no module beyond this one.
 */
export const chatMemoryRouteKey = "chat-memory";
export const chatMemoryClearRouteKey = "chat-memory-clear";

/** The front bot's board-only routes, as the manifest declares them. */
export const frontBotRoutes = (
  [
    // The bot's own comment ids on one chat task, read by Messenger.
    [chatNotesRouteKey, "GET", "/chat-notes/:taskId"],
    // The bot's memory of one chat and the asking board user: read and clear (front-bot-memory.ts).
    [chatMemoryRouteKey, "GET", "/chat-memory/:taskId"],
    [chatMemoryClearRouteKey, "DELETE", "/chat-memory/:taskId"],
  ] as const
).map(([routeKey, method, path]) => ({
  routeKey,
  method,
  path,
  auth: "board" as const,
  capability: "api.routes.register" as const,
  companyResolution: { from: "query" as const, key: "companyId" },
}));

/** One comment the bot posted. */
export interface AutomaticNote {
  readonly commentId: string;
  /** The agent run the message woke, when the bot knew it. */
  readonly runId: string | undefined;
  readonly at: string;
}

/** What the bot keeps per task. */
interface NotesRecord {
  readonly companyId: string;
  readonly notes: readonly AutomaticNote[];
}

/** How many notes are kept per task; older ones drop out of the list. */
const keptNotes = 200;

type StateGet = Pick<PluginStateClient, "get">;
type StateGetSet = Pick<PluginStateClient, "get" | "set">;
type StateGetDelete = Pick<PluginStateClient, "get" | "delete">;

function notesKey(taskId: string) {
  return {
    scopeKind: "issue",
    scopeId: taskId,
    namespace: "front-bot",
    stateKey: "notes",
  } as const;
}

/** The bot's notes on a task of this company; none for a task of another company. */
export async function automaticNotes(
  state: StateGet,
  companyId: string,
  taskId: string,
): Promise<readonly AutomaticNote[]> {
  const record = (await state.get(notesKey(taskId))) as NotesRecord | null;
  return record !== null && record.companyId === companyId ? record.notes : [];
}

/** Adds a note the bot just posted to its task's list. */
export async function rememberNote(
  state: StateGetSet,
  companyId: string,
  taskId: string,
  note: AutomaticNote,
): Promise<void> {
  const notes = await automaticNotes(state, companyId, taskId);
  await state.set(notesKey(taskId), { companyId, notes: [...notes, note].slice(-keptNotes) });
}

/** One progress note (HAL-19218): never a comment, kept here and served on the same route. */
export interface ProgressNote {
  readonly at: string;
  readonly text: string;
}

/** The progress notes of a task's newest watched run. */
export interface RunNotes {
  readonly runId: string;
  readonly notes: readonly ProgressNote[];
}

/** Progress notes are dropped a day after the newest one (HAL-18743 section 5). */
const progressKeptMs = 24 * 60 * 60_000;

function progressKey(taskId: string) {
  return {
    scopeKind: "issue",
    scopeId: taskId,
    namespace: "front-bot",
    stateKey: "progress",
  } as const;
}

/**
 * The task's progress notes, for this company and less than a day old;
 * otherwise undefined. Notes a day old are deleted here, so they leave plugin
 * state even when no later run writes a note.
 */
export async function progressNotes(
  state: StateGetDelete,
  companyId: string,
  taskId: string,
  now: Date,
): Promise<RunNotes | undefined> {
  const record = (await state.get(progressKey(taskId))) as
    | (RunNotes & { companyId: string })
    | null;
  if (record === null || record.companyId !== companyId) {
    return undefined;
  }
  const newest = record.notes.at(-1);
  if (newest === undefined || now.getTime() - new Date(newest.at).getTime() > progressKeptMs) {
    await state.delete(progressKey(taskId));
    return undefined;
  }
  return { runId: record.runId, notes: record.notes };
}

/** Adds a progress note; a note of a new run replaces the last run's notes. */
export async function rememberProgressNote(
  state: StateGetSet,
  companyId: string,
  taskId: string,
  runId: string,
  note: ProgressNote,
): Promise<void> {
  const record = (await state.get(progressKey(taskId))) as
    | (RunNotes & { companyId: string })
    | null;
  const sameRun = record !== null && record.companyId === companyId && record.runId === runId;
  const notes = sameRun ? [...record.notes, note] : [note];
  await state.set(progressKey(taskId), { companyId, runId, notes });
}

/**
 * What posting a comment of the bot's came to: not posted, posted and its id
 * kept, or posted but its id not kept. The readers still skip an unkept one by
 * its prefix, so it is logged as posted with its own reason.
 */
export type PostResult = "failed" | "posted" | "unsaved";

/** Posts the bot's comment with no author, which wakes nobody, and keeps its id. */
export async function postNote(
  ctx: { readonly issues: Pick<PluginIssuesClient, "createComment">; readonly state: StateGetSet },
  task: { readonly id: string; readonly companyId: string },
  body: string,
  note: Omit<AutomaticNote, "commentId">,
): Promise<PostResult> {
  let commentId: string;
  try {
    commentId = (await ctx.issues.createComment(task.id, body, task.companyId)).id;
  } catch {
    return "failed";
  }
  try {
    await rememberNote(ctx.state, task.companyId, task.id, { ...note, commentId });
    return "posted";
  } catch {
    return "unsaved";
  }
}

/** A comment as the other handlers see it. */
interface CommentLike {
  readonly id?: string;
  readonly authorAgentId: string | null;
  readonly authorUserId: string | null;
  readonly body: string;
}

/**
 * Whether a comment is the bot's: its id is on the list, or it has no author
 * and starts with the assistant's label, the older note prefix or a lookup's
 * answer (HAL-19222).
 * Only the plugin and Paperclip itself post with
 * no author, so the second rule covers the moment between the post and the
 * list's save; a person typing the prefix still has an author.
 */
export function isAutomaticNote(comment: CommentLike, ownIds: ReadonlySet<string>): boolean {
  if (comment.id !== undefined && ownIds.has(comment.id)) {
    return true;
  }
  return (
    comment.authorAgentId === null &&
    comment.authorUserId === null &&
    [assistantLabel, automaticNotePrefix, automaticAnswerStart].some((start) =>
      comment.body.startsWith(start),
    )
  );
}

/** The ids of the bot's notes on a task, for a handler that skips them. */
export async function automaticNoteIds(
  state: StateGet,
  companyId: string,
  taskId: string,
): Promise<ReadonlySet<string>> {
  return new Set((await automaticNotes(state, companyId, taskId)).map((note) => note.commentId));
}

/** A task id: Paperclip's ids are UUIDs; anything else is refused before reading state. */
const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Answers `GET /chat-notes/{taskId}`, board only: the bot's comment ids on
 * that task and the progress notes of its newest run (`null` when there are none).
 */
export async function handleChatNotes(
  input: PluginApiRequestInput,
  ctx: { readonly state: StateGetDelete },
  now: Date = new Date(),
): Promise<PluginApiResponse> {
  const userId = input.actor.actorType === "user" ? input.actor.userId : undefined;
  if (typeof userId !== "string" || userId === "") {
    return { status: 403, body: { error: "Only the board can read a chat's automatic notes." } };
  }
  const taskId = input.params["taskId"] ?? "";
  if (!taskIdPattern.test(taskId)) {
    return { status: 404, body: { error: "No such task." } };
  }
  return {
    status: 200,
    body: {
      automaticNotes: await automaticNotes(ctx.state, input.companyId, taskId),
      progressNotes: (await progressNotes(ctx.state, input.companyId, taskId, now)) ?? null,
    },
  };
}
