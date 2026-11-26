import type { InboxItem, MessagingId } from "@halonicjs/ports";
import { isChannel } from "./channel.ts";
import { chatAgent } from "./chat-name.ts";
import type { ConversationRow } from "./messenger.ts";
import { isFromAgentOf } from "./quick-actions.ts";

/** One card or question waiting for the person, with the conversation it belongs to. */
export interface WaitingCard {
  readonly card: InboxItem;
  /** The channel it was asked in, or else the chat of the agent who asked. */
  readonly row: ConversationRow;
  /** Who asked, as the source names them. */
  readonly agent: string;
  /** Who asked, by ID, for the tint of their avatar (`messenger.agent-avatar-tint`). */
  readonly agentId: MessagingId;
}

/**
 * Everything waiting for the person across the Messenger's conversations, oldest first
 * (`messenger.needs-you`): each channel's open questions, then the open cards of each chat's agent.
 * A card shows once, under the channel it was asked in when there is one. An open item no listed
 * conversation holds stays the Inbox's alone.
 */
export function waitingCards(
  rows: readonly ConversationRow[],
  items: readonly InboxItem[],
): readonly WaitingCard[] {
  const waiting = new Map<MessagingId, WaitingCard>();
  for (const row of rows) {
    for (const question of row.questions ?? []) {
      if (!waiting.has(question.item.id)) {
        waiting.set(question.item.id, {
          card: question.item,
          row,
          agent: question.agent,
          agentId: question.agentId,
        });
      }
    }
  }
  for (const item of items) {
    if (item.state.kind !== "open" || waiting.has(item.id)) continue;
    const row = rows.find((each) => !isChannel(each) && isFromAgentOf(item, each));
    if (row === undefined) continue;
    waiting.set(item.id, {
      card: item,
      row,
      agent: chatAgent(row)?.name ?? row.conversation.title,
      agentId: row.conversation.agent,
    });
  }
  return [...waiting.values()].sort((a, b) => a.card.createdAt.localeCompare(b.card.createdAt));
}

/** What "Needs you" reads: what waits, and every Inbox item as read, so a card that left shows how it ended. */
export interface NeedsYouRead {
  readonly waiting: readonly WaitingCard[];
  readonly items: readonly InboxItem[];
}

/**
 * A card that left "Needs you", as it ended (`messenger.final-state`), or `undefined` while it
 * still waits or once the source no longer lists it.
 */
export function endedCard(items: readonly InboxItem[], left: WaitingCard): WaitingCard | undefined {
  const item = items.find((each) => each.id === left.card.id);
  return item === undefined || item.state.kind === "open" ? undefined : { ...left, card: item };
}
