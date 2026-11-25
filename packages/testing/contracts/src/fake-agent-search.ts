import type {
  Conversation,
  InboxItem,
  Message,
  MessagingAgent,
  MessagingId,
  SearchHit,
  WorkItem,
} from "@halonicjs/ports";

/** What a `FakeAgentMessaging` search reads: its items as a read gives them. */
export interface FakeSearchable {
  agents: readonly MessagingAgent[];
  conversations: readonly Conversation[];
  messages: readonly Message[];
  inbox: readonly InboxItem[];
  work: readonly WorkItem[];
  /** The source of a message's conversation. */
  sourceOfConversation: (conversation: MessagingId) => MessagingId;
}

/** Every item whose title or text holds `text`, ignoring case. */
export function searchHits(text: string, held: FakeSearchable): SearchHit[] {
  const wanted = text.toLowerCase();
  const hit = (
    kind: SearchHit["kind"],
    id: MessagingId,
    source: MessagingId,
    title: string,
    excerpt: string,
  ) =>
    excerpt.toLowerCase().includes(wanted) || title.toLowerCase().includes(wanted)
      ? [{ kind, id, source, title, excerpt }]
      : [];
  return [
    ...held.agents.flatMap((a) => hit("agent", a.id, a.source, a.name, a.title ?? "")),
    ...held.conversations.flatMap((c) => hit("conversation", c.id, c.source, c.title, "")),
    ...held.messages.flatMap((m) =>
      hit("message", m.id, held.sourceOfConversation(m.conversation), "", m.body),
    ),
    ...held.inbox.flatMap((i) => hit("inbox-item", i.id, i.source, "", i.question)),
    ...held.work.flatMap((w) => hit("work", w.id, w.source, w.label, w.title)),
  ];
}
