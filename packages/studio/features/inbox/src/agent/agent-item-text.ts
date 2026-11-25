import type {
  InboxItem as AgentItem,
  InboxAnswer,
  MessagingAgent,
  MessagingAuthor,
  MessagingSource,
  WorkItem,
} from "@halonicjs/ports";
import { markHiddenName } from "@halonicjs/std";
import {
  clockTime,
  decidedAt,
  isLate,
  type MarkdownInline,
  readMarkdown,
  waitingFor,
} from "@halonicjs/studio-kit";

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

/**
 * Who asks, over the card's title (design review HAL-18481, 7): "Chief · Chief of Staff asks" as
 * Messenger names the agent, and "Chief asks" when the source gives no title.
 */
export function askerLine(
  from: Exclude<MessagingAuthor, { kind: "me" }>,
  agents: readonly MessagingAgent[],
): string {
  const agent = from.kind === "agent" ? agents.find((each) => each.id === from.agent) : undefined;
  const title = agent?.title?.trim() ?? "";
  const name = markHiddenName(from.name);
  return title === "" ? `${name} asks` : `${name} · ${markHiddenName(title)} asks`;
}

/**
 * Whether the question is no more than its title, one line in one block, so the card shows it
 * once, as its title, and not again as its body.
 */
export function questionIsTitle(item: AgentItem): boolean {
  const blocks = readMarkdown(item.question);
  return blocks.length <= 1 && !item.question.trim().includes("\n");
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

/**
 * The work an item came from, as its card says it: "From HAL-12 · Fix the login". Any task or work
 * can ask, not only a chat, so the card names it (`inbox.every-waiting-item`).
 */
export function workLine(work: WorkItem): string {
  return `From ${markHiddenName(work.label)} · ${markHiddenName(work.title)}`;
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

/**
 * How an item was answered: the option's label, the labels picked for its questions, the reply in
 * quotes, or how an action request ended ("succeeded") until the Inbox shows action items in full.
 */
export function answerText(item: AgentItem, answer: InboxAnswer): string {
  if (answer.kind === "reply") return `“${answer.text}”`;
  if (answer.kind === "action-result") return answer.outcome;
  if (answer.kind === "answers") {
    return answer.answers
      .flatMap((each) => {
        const offered = item.questions?.find((question) => question.id === each.question)?.options;
        return each.options.map((id) => offered?.find((option) => option.id === id)?.label ?? id);
      })
      .join(", ");
  }
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

/**
 * The link on an item its source can't take an answer to here, which opens the item in the
 * source (Nina's wording, HAL-18923): "Answer in Paperclip · Acme".
 */
export function answerElsewhereLine(source: MessagingSource | undefined): string {
  return `Answer in ${source?.label ?? "Paperclip"}`;
}
