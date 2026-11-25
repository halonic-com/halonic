import type { InboxAnswer, InboxItem, Message } from "@halonicjs/ports";
import { answerLabels, decidedAt } from "@halonicjs/studio-kit";
import { messengerWords } from "./messenger-words.ts";

/** One entry of a chat's timeline: a message, or a card the chat's agent put to the person. */
export type TimelineEntry =
  | { readonly kind: "message"; readonly message: Message }
  | { readonly kind: "card"; readonly card: InboxItem };

/**
 * A chat's messages and cards in one timeline, oldest first (requirement
 * `messenger.inline-cards`): each card sits where its `createdAt` falls among the messages' `sentAt`,
 * open or answered. A card made at the same time as a message comes after it.
 *
 * @example
 * chatTimeline(messages, cards).map((entry) => entry.kind); // ["message", "card", "message"]
 */
export function chatTimeline(
  messages: readonly Message[],
  cards: readonly InboxItem[],
): readonly TimelineEntry[] {
  const entries = [
    ...messages.map((message) => ({
      entry: { kind: "message", message } as const,
      at: Date.parse(message.sentAt),
    })),
    ...cards.map((card) => ({
      entry: { kind: "card", card } as const,
      at: Date.parse(card.createdAt),
    })),
  ];
  // `sort` keeps equal times in their order, so a message stays before a card of the same time.
  return entries.sort((left, right) => left.at - right.at).map(({ entry }) => entry);
}

/** The cards that still wait for the person, oldest first: the bar counts them and goes to the first. */
export function waitingCards(cards: readonly InboxItem[]): readonly InboxItem[] {
  return cards
    .filter((card) => card.state.kind === "open")
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

/**
 * What an answered card keeps in the chat, as its record: the choice and the time, "Approve, 12:10".
 * An open card has none.
 */
export function cardRecord(card: InboxItem): string | undefined {
  if (card.state.kind !== "answered") return undefined;
  return `${choiceOf(card, card.state.answer)}, ${decidedAt(new Date(card.state.answeredAt))}`;
}

/**
 * How a card was answered: the option's label, the labels picked for its questions, the reply in
 * quotes, or how an action ended.
 */
function choiceOf(card: InboxItem, answer: InboxAnswer): string {
  if (answer.kind === "reply") return `“${answer.text}”`;
  if (answer.kind === "action-result") return messengerWords.card.outcomes[answer.outcome];
  if (answer.kind === "answers") return answerLabels(card.questions, answer.answers).join(", ");
  return card.options.find((option) => option.id === answer.option)?.label ?? answer.option;
}
