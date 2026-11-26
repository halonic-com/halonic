import type { InboxItem, Message, MessagingAgent } from "@halonicjs/ports";

/**
 * Where the answer to a question asked from the box stands (requirement `quick-ask.answer`):
 * - `waiting`: the agent hasn't started on it; the question waits in the chat as in Messenger.
 * - `working`: the agent is working; the box shows the breathing working line.
 * - `answer`: the agent's messages since the question, oldest first.
 * - `card`: the agent asks the person to choose; the box sends them to Messenger to answer.
 */
export type AnswerState =
  | { readonly kind: "waiting" }
  | { readonly kind: "working" }
  | { readonly kind: "answer"; readonly messages: readonly Message[] }
  | { readonly kind: "card"; readonly card: InboxItem; readonly messages: readonly Message[] };

/** What {@link answerState} reads: the chat as it is now, and when the question went out. */
export interface AnswerFacts {
  /** The chat's agent, with what it is doing now. */
  readonly agent: MessagingAgent;
  /** The chat's messages, oldest first. */
  readonly messages: readonly Message[];
  /** The chat agent's open cards, oldest first. */
  readonly cards: readonly InboxItem[];
  /** When the question was sent, as ISO text. */
  readonly sentAt: string;
}

/**
 * The answer's state from the chat as it is now. Only what came after the question counts, so an
 * older card or message in the same chat is never taken for its answer. A new card wins over a
 * message, because cards are answered in Messenger, not in the box.
 *
 * @example
 * answerState({ agent, messages, cards: [], sentAt: question.sentAt });
 * // { kind: "answer", messages: [reply] }
 */
export function answerState(facts: AnswerFacts): AnswerState {
  const replies = facts.messages.filter(
    (message) => isAgentReply(message) && isLater(message.sentAt, facts.sentAt),
  );
  const card = facts.cards.find((each) => !isLater(facts.sentAt, each.createdAt));
  if (card !== undefined) return { kind: "card", card, messages: replies };
  if (replies.length > 0) return { kind: "answer", messages: replies };
  return facts.agent.activity === "working" ? { kind: "working" } : { kind: "waiting" };
}

/**
 * Whether `message` is the agent's own: written by the agent, and not a note its source wrote
 * automatically on its behalf, such as Paperclip's fast-response receipt, which only says the
 * agent picked the question up (requirement `quick-ask.automatic-notes`).
 */
export function isAgentReply(message: Message): boolean {
  return message.author.kind === "agent" && message.automatic !== true;
}

/** Whether a state is an answer the person has now seen, so the box stops waiting for one. */
export function isAnswered(state: AnswerState): boolean {
  return state.kind === "answer" || state.kind === "card";
}

/**
 * Whether ISO time `time` is after `than`. Compared as instants, not as text, because messages and
 * cards come from different sources, which may write times with another precision or offset.
 */
export function isLater(time: string, than: string): boolean {
  return Date.parse(time) > Date.parse(than);
}
