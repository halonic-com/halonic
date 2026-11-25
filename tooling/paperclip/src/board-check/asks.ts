import { amsterdamTime } from "../amsterdam-time.ts";
import { signature } from "./writes.ts";

/**
 * Spotting comments that ask the board, the way the Board Checker's script
 * (`sv.cjs`) does: an agent's comment from the last 12 minutes whose text
 * matches the pattern below. The text is only matched here; nothing keeps,
 * logs or posts it. An ask is remembered by its comment id.
 */

/** The `sv.cjs` pattern, but by role only: an ask names "the board", never a person. */
export const askPattern =
  /(for the board|board.s (yes|answer|decision|verdict|card)|waiting on the board|needs the board|card (is )?(up|posted)|board card)/i;

/** How far back an ask counts, as in `sv.cjs`: two passes of 10 minutes overlap. */
export const askWindowMs = 12 * 60_000;
/** The Merger's queue requests live on this task; they aren't asks. */
export const mergerRequestsTask = "HAL-14388";
/** Asks are remembered this long, so a repeated event can't wake the Board Checker twice. */
export const keepAsksMs = 7 * 24 * 60 * 60_000;
/** The `board-asks` document lists the asks of the last day. */
export const listAsksMs = 24 * 60 * 60_000;

/** A comment as the spotting reads it. */
export interface AskComment {
  readonly id: string;
  readonly taskId: string;
  readonly identifier: string;
  readonly authorAgentId: string | null;
  readonly createdAt: string;
  /** "fast_response" marks Paperclip's own receipts written in an agent's voice. */
  readonly origin: string | undefined;
  readonly body: string;
}

/** An ask the board check has seen: ids and a time, never the comment's text. */
export interface SeenAsk {
  readonly commentId: string;
  readonly taskId: string;
  readonly identifier: string;
  readonly authorAgentId: string;
  readonly createdAt: string;
}

/** Whose comments are never asks, besides the board's and the plugin's own. */
export interface AskRules {
  /** The Board Checker answers asks; its answers name the board too. */
  readonly boardCheckerAgentId: string | undefined;
  /** Whoever holds the task an ask wakes, when that isn't the Board Checker: its answers name the board too. */
  readonly askWakeAgentId?: string | undefined;
  readonly mergerAgentId: string | undefined;
}

/**
 * Whether a comment asks the board. Only an agent's comment can: the board's
 * own comments and the plugin's (no agent author) never do, and neither do
 * the answers of the Board Checker or of whoever the ask wakes, Paperclip's receipts or the Merger's requests.
 */
export function isAsk(comment: AskComment, rules: AskRules, now: Date): boolean {
  const author = comment.authorAgentId;
  if (author === null || comment.origin === "fast_response") {
    return false;
  }
  if (author === rules.boardCheckerAgentId || author === rules.askWakeAgentId) {
    return false;
  }
  if (author === rules.mergerAgentId && comment.identifier === mergerRequestsTask) {
    return false;
  }
  if (comment.body.includes(signature)) {
    return false;
  }
  const age = now.getTime() - Date.parse(comment.createdAt);
  return age >= 0 && age <= askWindowMs && askPattern.test(comment.body);
}

/** The asks among `comments` that haven't been seen yet, oldest first, without their text. */
export function newAsks(
  comments: readonly AskComment[],
  seen: ReadonlySet<string>,
  rules: AskRules,
  now: Date,
): SeenAsk[] {
  return comments
    .filter((comment) => !seen.has(comment.id) && isAsk(comment, rules, now))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((comment) => ({
      commentId: comment.id,
      taskId: comment.taskId,
      identifier: comment.identifier,
      authorAgentId: comment.authorAgentId ?? "",
      createdAt: comment.createdAt,
    }));
}

/** Reads the remembered asks from plugin state; anything malformed is dropped. */
export function readSeenAsks(value: unknown): SeenAsk[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is SeenAsk =>
      typeof entry === "object" &&
      entry !== null &&
      ["commentId", "taskId", "identifier", "authorAgentId", "createdAt"].every(
        (field) => typeof (entry as Record<string, unknown>)[field] === "string",
      ),
  );
}

/** The remembered asks plus the new ones, without those older than `keepAsksMs`. */
export function rememberAsks(seen: readonly SeenAsk[], found: readonly SeenAsk[], now: Date) {
  const since = now.getTime() - keepAsksMs;
  return [...seen, ...found].filter((ask) => Date.parse(ask.createdAt) >= since);
}

/** A link to the comment inside Paperclip, from the task's identifier (`HAL-123`). */
export function askLink(ask: SeenAsk): string {
  const prefix = ask.identifier.split("-")[0] ?? "";
  return `/${prefix}/issues/${ask.identifier}#comment-${ask.commentId}`;
}

/** The `board-asks` document: the last day's asks, newest first, with no excerpt. */
export function asksDocument(
  asks: readonly SeenAsk[],
  names: ReadonlyMap<string, string>,
  now: Date,
): string {
  const since = now.getTime() - listAsksMs;
  const rows = asks
    .filter((ask) => Date.parse(ask.createdAt) >= since)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(
      (ask) =>
        `| ${ask.identifier} | ${ask.commentId} | ${names.get(ask.authorAgentId) ?? ask.authorAgentId} | ${amsterdamTime(ask.createdAt)} | [open](${askLink(ask)}) |`,
    );
  return [
    "# Board asks",
    "",
    `Agents' comments that ask the board, from the last 24 hours, newest first. Updated ${amsterdamTime(now)}.`,
    "The list carries no text from the comments: open the link to read an ask. An entry here never answers or covers an ask.",
    "",
    "| Task | Comment | Author | Time | Link |",
    "| --- | --- | --- | --- | --- |",
    ...(rows.length > 0 ? rows : ["| (none) | | | | |"]),
  ].join("\n");
}
