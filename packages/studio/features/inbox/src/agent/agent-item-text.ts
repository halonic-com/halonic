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
  answerLabels,
  clockTime,
  decidedAt,
  isLate,
  questionBody,
  questionTitle,
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
  return markHiddenName(questionTitle(item.question));
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
 * The question as the card's body, without the line its title came from, so a heading such as
 * "New secret: GOOGLE_ADS_TOKEN" shows once (design check HAL-19016, 7). Empty when the question is
 * no more than its title. A first block the title can't say in full, such as code or a link, stays.
 */
export function agentItemBody(item: AgentItem): string {
  return questionBody(item.question);
}

/** Who wrote or answered, as a line says it: "you", or their name. */
export function authorName(author: MessagingAuthor): string {
  return author.kind === "me" ? "you" : markHiddenName(author.name);
}

/**
 * Where an item comes from and who asks, the meta line without its wait: "Paperclip · Acme ·
 * Chief". An answered card's header ends there, since the item no longer waits (HAL-19913).
 */
export function agentItemAsker(item: AgentItem, source: MessagingSource | undefined): string {
  const from = item.from.kind === "me" ? [] : [authorName(item.from)];
  return [...(source === undefined ? [] : [source.label]), ...from].join(" · ");
}

/**
 * The work an item came from, as its card says it: "From HAL-12 · Fix the login". Any task or work
 * can ask, not only a chat, so the card names it (`inbox.every-waiting-item`).
 */
export function workLine(work: WorkItem): string {
  return `From ${markHiddenName(work.label)} · ${markHiddenName(work.title)}`;
}

/** The link to an item's page in its source: "Open in Paperclip". */
export const openInSite = (site: string): string => `Open in ${site}`;

/**
 * The one page link an item's card shows (`inbox.agent-card-web-link`), when its source gives a
 * `webLink`: the place to answer it, when the source names one, else the item's own page.
 */
export function agentItemPageLink(
  item: AgentItem,
): { readonly href: string; readonly label: string } | undefined {
  if (item.webLink === undefined) return undefined;
  return {
    href: item.answerElsewhere?.link ?? item.webLink.link,
    label: openInSite(item.webLink.site),
  };
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
  if (answer.kind === "answers") return answerLabels(item.questions, answer.answers).join(", ");
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
