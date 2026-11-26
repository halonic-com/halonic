import type {
  PluginApiRequestInput,
  PluginApiResponse,
  PluginStateClient,
} from "@paperclipai/plugin-sdk";
import { automaticNotePrefix } from "../front-bot/prompt.ts";

/**
 * The front bot's list of its own comments (HAL-18847 section 2.2). A plugin
 * can't mark a comment in its metadata, so the bot keeps the ids of what it
 * posted, per task, and serves them on a read-only board route that Messenger
 * keys on. chief-line, board-check and the PR watcher skip the same ids, so a
 * bot comment never starts an action or counts as a comment (section 7, point 3).
 */

/** The route's key, as the manifest declares it. */
export const chatNotesRouteKey = "chat-notes";

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

/** A comment as the other handlers see it. */
interface CommentLike {
  readonly id?: string;
  readonly authorAgentId: string | null;
  readonly authorUserId: string | null;
  readonly body: string;
}

/**
 * Whether a comment is the bot's: its id is on the list, or it has no author
 * and starts with the prefix. Only the plugin and Paperclip itself post with
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
    comment.body.startsWith(automaticNotePrefix)
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

/** Answers `GET /chat-notes/{taskId}`: the bot's comment ids on that task, board only. */
export async function handleChatNotes(
  input: PluginApiRequestInput,
  ctx: { readonly state: StateGet },
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
    body: { automaticNotes: await automaticNotes(ctx.state, input.companyId, taskId) },
  };
}
