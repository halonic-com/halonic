import type { InboxItem, Message } from "@halonicjs/ports";

/** One entry of a chat's timeline: a message, or a card the chat's agent put to the person. */
export type TimelineEntry =
  | { readonly kind: "message"; readonly message: Message }
  | { readonly kind: "card"; readonly card: InboxItem };

/**
 * A chat's messages and cards in one timeline, oldest first (requirement
 * `messenger.inline-cards`): each card sits where its `createdAt` falls among the messages' `sentAt`. A card made at the same time as a message comes after it.
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
