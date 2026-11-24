import type {
  InboxItem as AgentItem,
  InboxAnswer,
  MessagingAuthor,
  MessagingSource,
} from "@halonicjs/ports";
import { markHiddenName } from "@halonicjs/std";
import { type MarkdownInline, readMarkdown } from "@halonicjs/studio-kit";
import { clockTime, decidedAt, isLate, waitingFor } from "../plain/waiting-time.ts";

/** The list's key of an agent item; the item's ID is opaque, so the prefix keeps it apart from run items. */
export function agentItemKey(item: AgentItem): string {
  return `agent:${item.id}`;
}

/**
 * An item's title, for its row and its card: the question's first block as plain text. The
 * question is agent-written Markdown, so its marks are read, never shown, and a hidden character
 * is marked as in every other title.
 */
export function agentItemTitle(item: AgentItem): string {
  const [first] = readMarkdown(item.question);
  if (first === undefined) return "";
  if (first.kind === "code") return markHiddenName(first.text);
  const inlines = first.kind === "list" ? (first.items[0] ?? []) : first.inlines;
  return markHiddenName(plainText(inlines).split("\n")[0] ?? "");
}

function plainText(inlines: readonly MarkdownInline[]): string {
  return inlines
    .map((inline) =>
      inline.kind === "strong" || inline.kind === "em" ? plainText(inline.children) : inline.text,
    )
    .join("");
}

/** Who wrote or answered, as a line says it: "you", or their name. */
export function authorName(author: MessagingAuthor): string {
  return author.kind === "me" ? "you" : markHiddenName(author.name);
}

/** The row's meta line: "Paperclip · Acme · Chief · Waiting 3 h". */
export function agentItemMeta(
  item: AgentItem,
  source: MessagingSource | undefined,
  now: Date,
): string {
  const from = item.from.kind === "me" ? [] : [authorName(item.from)];
  const parts = [...(source === undefined ? [] : [source.label]), ...from];
  return [...parts, waitingFor(new Date(item.createdAt), now)].join(" · ");
}

/** Whether the item has waited a day or more, as a run's item is late. */
export function isAgentItemLate(item: AgentItem, now: Date): boolean {
  return isLate(new Date(item.createdAt), now);
}

/**
 * Why a source's answer buttons are off: "Offline, as of 14:02" while it can't be reached, "Sign
 * in again to send your answer." once its sign-in ended, nothing while it is online.
 */
export function sourceDownLine(source: MessagingSource | undefined, now: Date): string | null {
  if (source === undefined) return null;
  if (source.state.kind === "offline") {
    return `Offline, as of ${clockTime(new Date(source.state.asOf), now)}`;
  }
  return source.state.kind === "signed-out" ? "Sign in again to send your answer." : null;
}

/** How an item was answered: the option's label, or the reply in quotes. */
export function answerText(item: AgentItem, answer: InboxAnswer): string {
  if (answer.kind === "reply") return `“${answer.text}”`;
  return item.options.find((option) => option.id === answer.option)?.label ?? answer.option;
}

/**
 * The line once an item is answered: "Answered at 14:02: Yes." from this card, "Answered
 * elsewhere by Liam at 14:02: Yes." from another client or person (flow-inbox 5.4, render 5f).
 * `how` is left out while the item isn't read again yet.
 */
export function answeredLine(
  here: boolean,
  by: MessagingAuthor,
  answeredAt: string,
  how: string | undefined,
): string {
  const who = here ? "Answered" : `Answered elsewhere by ${authorName(by)}`;
  const at = decidedAt(new Date(answeredAt));
  return how === undefined ? `${who} at ${at}.` : `${who} at ${at}: ${how}.`;
}
