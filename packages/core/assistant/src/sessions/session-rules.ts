import type { ChatMessage, SavedChat, SavedChatSummary } from "@halonicjs/ports";

/** A draft's title, and the title of a chat whose first message is only spaces (flow 5.4, 13). */
export const draftTitle = "New chat";

/** How many chats of each workspace are kept, Build and agent chats together (flow 5.4). */
export const keptChatCount = 40;

/** How long a tool result in a saved chat's history may be, in characters. */
export const savedToolResultLength = 4000;

/** What follows a tool result cut to {@link savedToolResultLength}. */
export const toolResultCutMark = "\n… (cut)";

const titleLength = 60;
const cutTitleLength = 57;

/**
 * A chat's title from its first message (`assistant.sessions.title-from-first-message`): the
 * first line with text, spaces collapsed, cut to 57 characters plus "…" when it is longer than
 * 60. A message of only spaces gives {@link draftTitle}.
 *
 * @example
 * titleFromFirstMessage("  Add a routine\nthat runs daily"); // "Add a routine"
 */
export function titleFromFirstMessage(message: string): string {
  const line = message
    .split(/\r?\n/u)
    .map((each) => each.replace(/\s+/gu, " ").trim())
    .find((each) => each !== "");
  if (line === undefined) return draftTitle;
  const characters = Array.from(line);
  return characters.length > titleLength
    ? `${characters.slice(0, cutTitleLength).join("")}…`
    : line;
}

/** A saved title as the chat shows it: chats saved before T14 called a draft "New session". */
export function shownTitle(title: string): string {
  return title === "New session" ? draftTitle : title;
}

/**
 * A chat's title once `message` is sent: from the message while the chat shows
 * {@link draftTitle}, else the title it has, such as one the person gave it.
 */
export function titleAfterSend(title: string, message: string): string {
  return shownTitle(title) === draftTitle ? titleFromFirstMessage(message) : title;
}

/**
 * Whether a chat is still a draft (`assistant.sessions.draft-until-first-message`): it has no
 * message from the person yet, so it isn't saved and isn't listed.
 */
export function isDraft(messages: readonly ChatMessage[]): boolean {
  return !messages.some((message) => message.role === "user");
}

/**
 * Orders chats most recently used first, comparing times as times, then by id
 * (`assistant.sessions.recent-first`).
 */
export function recentFirst(left: SavedChatSummary, right: SavedChatSummary): number {
  const byUse = Date.parse(right.lastUsedAt) - Date.parse(left.lastUsedAt);
  if (byUse !== 0 && !Number.isNaN(byUse)) return byUse;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

/**
 * The ids of the chats to delete so the workspace keeps its {@link keptChatCount} most recently
 * used (`assistant.sessions.keep-newest-40`). They go without a message.
 */
export function chatsToDrop(chats: readonly SavedChatSummary[]): string[] {
  return [...chats]
    .sort(recentFirst)
    .slice(keptChatCount)
    .map((chat) => chat.id);
}

/**
 * The history as it is saved (`assistant.sessions.shorten-long-tool-results`): every tool result
 * longer than {@link savedToolResultLength} characters is cut to its first ones followed by
 * {@link toolResultCutMark}. Only the model's view of a tool result is cut: the person's messages,
 * the replies and the tool calls (with a proposal's whole content) stay whole.
 */
export function shortenToolResults(messages: readonly ChatMessage[]): ChatMessage[] {
  return messages.map((message) =>
    message.role === "tool" && message.content.length > savedToolResultLength
      ? { ...message, content: message.content.slice(0, savedToolResultLength) + toolResultCutMark }
      : message,
  );
}

/**
 * The chat as it is saved, or `null` for a draft, which is never saved
 * (`assistant.sessions.draft-until-first-message`). Long tool results are cut.
 */
export function chatToSave(chat: SavedChat): SavedChat | null {
  if (isDraft(chat.messages)) return null;
  return { ...chat, messages: shortenToolResults(chat.messages) };
}

/** A saved chat as it comes back after a launch. */
export interface RestoredChat {
  /** The chat, never answering, with its title as it shows. */
  readonly chat: SavedChat;
  /** True when it was answering as Halonic closed: the chat adds "Stopped when Halonic closed." (H14). */
  readonly stoppedWhenClosed: boolean;
}

/**
 * A saved chat as it comes back (`assistant.sessions.keep-newest-40`): a chat that was answering
 * when Halonic closed comes back not busy, with the last step it showed, and says it stopped.
 */
export function restoredChat(saved: SavedChat): RestoredChat {
  return {
    chat: { ...saved, title: shownTitle(saved.title), answering: false },
    stoppedWhenClosed: saved.answering,
  };
}
