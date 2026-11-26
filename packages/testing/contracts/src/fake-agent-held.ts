import type {
  AnswerResult,
  Conversation,
  InboxItem,
  InboxItemState,
  Message,
  MessagingAgent,
  MessagingId,
  WorkItem,
} from "@halonicjs/ports";
import { copy } from "./fake-agent-values.ts";

/** Everything a source holds, live or as it was when its line was cut. */
export interface Held {
  agents: MessagingAgent[];
  conversations: Conversation[];
  messages: Message[];
  inbox: InboxItem[];
  work: WorkItem[];
}

/** A copy of what `live` holds for one source, as an offline source reads it until it is back. */
export function frozenHeld(
  live: Held,
  source: MessagingId,
  sourceOfConversation: (conversation: MessagingId) => MessagingId,
): Held {
  const pick = <Item extends { source: MessagingId }>(items: Item[]) =>
    copy(items.filter((each) => each.source === source));
  const messages = live.messages.filter(
    (each) => sourceOfConversation(each.conversation) === source,
  );
  return {
    agents: pick(live.agents),
    conversations: pick(live.conversations),
    messages: copy(messages),
    inbox: pick(live.inbox),
    work: pick(live.work),
  };
}

/** What answering an item that no longer waits gives, or `undefined` while it is open. */
export function settledAnswer(state: InboxItemState): AnswerResult | undefined {
  if (state.kind === "answered") {
    return { outcome: "already-answered", by: state.by, answeredAt: state.answeredAt };
  }
  if (state.kind === "closed") {
    return { outcome: "closed", reason: state.reason, closedAt: state.closedAt };
  }
  return undefined;
}
