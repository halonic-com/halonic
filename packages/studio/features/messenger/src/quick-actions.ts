import type { AgentMessaging, AnswerResult, InboxItem, SendResult } from "@halonicjs/ports";
import type { ConversationRow } from "./messenger.ts";
import { refusalOf } from "./refusal.ts";

/**
 * The plain message "Ask for an update" sends. It is a message like any the
 * person types: the agent reads it, nothing runs on this machine.
 */
export const askForUpdateText = "Can you give me an update?";

/**
 * The quick actions of one chat (requirement `messenger.quick-actions`): the
 * open cards its agent put to the person, each answered with one of its own
 * options, and "Ask for an update". Each action is exactly one `answer` or one
 * `send` through `AgentMessaging`, never a command run locally. Offline or
 * signed out, an action asks the source nothing (ADR, Offline).
 *
 * @example
 * const actions = new QuickActions(messaging);
 * const [card] = await actions.cards(row);
 * await actions.answerCard(row, card, card.options[0].id);
 */
export class QuickActions {
  private readonly messaging: AgentMessaging;

  constructor(messaging: AgentMessaging) {
    this.messaging = messaging;
  }

  /**
   * The chat agent's open cards, and in a channel the questions its members asked the person
   * there, oldest first, as the chat shows them. A card is the same item the Inbox lists, so
   * answering it here answers it there.
   */
  async cards(row: ConversationRow): Promise<readonly InboxItem[]> {
    const cards = await this.chatCards(row);
    return cards.filter((card) => card.state.kind === "open");
  }

  /**
   * The same cards, open and answered, oldest first: the chat's timeline shows each where it was
   * made, and an answered one as its record (requirement `messenger.inline-cards`).
   */
  async chatCards(row: ConversationRow): Promise<readonly InboxItem[]> {
    const items = await this.messaging.listInboxItems();
    const asked = new Set((row.questions ?? []).map((question) => question.item.id));
    return items
      .filter((item) => isFromAgentOf(item, row) || asked.has(item.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Answers one of the chat's cards with one of its options: one `answer` call. */
  async answerCard(row: ConversationRow, card: InboxItem, option: string): Promise<AnswerResult> {
    const refusal = refusalOf(row);
    if (refusal !== undefined) return { outcome: "refused", reason: refusal };
    return this.messaging.answer(card.id, { kind: "option", option });
  }

  /** Asks the chat's agent where its work stands: one `send` of {@link askForUpdateText}. */
  async askForUpdate(row: ConversationRow): Promise<SendResult> {
    const refusal = refusalOf(row);
    if (refusal !== undefined) return { outcome: "refused", reason: refusal };
    return this.messaging.send(row.conversation.id, askForUpdateText);
  }
}

/** Whether a card came from the chat's own agent, on the chat's own source. */
function isFromAgentOf(item: InboxItem, row: ConversationRow): boolean {
  return (
    item.source === row.conversation.source &&
    item.from.kind === "agent" &&
    item.from.agent === row.conversation.agent
  );
}
