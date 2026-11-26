import type {
  Conversation,
  InboxItem,
  Message,
  MessagingAgent,
  MessagingId,
  MessagingRefusal,
} from "@halonicjs/ports";
import type { ConversationRow, DraftOutcome } from "@halonicjs/studio-feature-messenger/api";
import type { AskMessenger } from "../ask-session.ts";

/** An agent of the Acme source, idle unless told otherwise. */
export function agent(name: string, activity: MessagingAgent["activity"] = "idle"): MessagingAgent {
  return { id: `agent-${name}`, source: "acme", name, activity };
}

/** A 1:1 chat with `of`, or a channel when `members` is given. */
export function chat(of: MessagingAgent, members?: readonly MessagingAgent[]): ConversationRow {
  const conversation: Conversation = {
    id: `chat-${of.name}`,
    source: of.source,
    agent: of.id,
    title: of.name,
    updatedAt: "2026-11-25T13:00:00.000Z",
    waitingForMe: false,
    ...(members === undefined ? {} : { members: members.map((member) => member.id) }),
  };
  return {
    conversation,
    agents: members ?? [of],
    sourceAgents: members ?? [of],
    source: {
      id: of.source,
      provider: "paperclip",
      label: "Paperclip · Acme",
      state: { kind: "online", asOf: "2026-11-25T13:00:00.000Z" },
    },
  };
}

/** A message in `conversation` from the person, or from `from` when given. */
export function message(
  conversation: MessagingId,
  body: string,
  sentAt: string,
  from?: MessagingAgent,
): Message {
  const author =
    from === undefined
      ? ({ kind: "me" } as const)
      : ({ kind: "agent", agent: from.id, name: from.name } as const);
  return { id: `${conversation}-${sentAt}`, conversation, author, body, attachments: [], sentAt };
}

/** An open card from `from`, made at `createdAt`. */
export function card(from: MessagingAgent, question: string, createdAt: string): InboxItem {
  return {
    id: `card-${createdAt}`,
    source: from.source,
    from: { kind: "agent", agent: from.id, name: from.name },
    question,
    options: [{ id: "yes", label: "Yes" }],
    attachments: [],
    createdAt,
    state: { kind: "open" },
  };
}

/**
 * A Messenger the box can talk to in tests: chats, their messages and cards held here, sending
 * stamped at `sentAt`, and changes told by {@link FakeMessenger.change}.
 */
export class FakeMessenger implements AskMessenger {
  chats: ConversationRow[];
  readonly messagesOf = new Map<MessagingId, Message[]>();
  cardsOf: InboxItem[] = [];
  /** Sending is refused with this while set. */
  refuse: MessagingRefusal | undefined;
  sentAt = "2026-11-25T13:40:00.000Z";
  readonly listeners = new Set<(source: MessagingId) => void>();
  readonly quickActions = {
    cards: async (row: ConversationRow) =>
      this.cardsOf.filter(
        (each) => each.from.kind === "agent" && each.from.agent === row.conversation.agent,
      ),
  };

  constructor(chats: ConversationRow[]) {
    this.chats = chats;
  }

  async rows(): Promise<readonly ConversationRow[]> {
    return this.chats;
  }

  async messages(conversation: MessagingId): Promise<readonly Message[]> {
    return this.messagesOf.get(conversation) ?? [];
  }

  async sendText(conversation: MessagingId, body: string): Promise<DraftOutcome> {
    if (body.trim() === "") return { outcome: "kept", reason: "blank" };
    if (this.refuse !== undefined) return { outcome: "kept", reason: this.refuse };
    const sent = message(conversation, body, this.sentAt);
    this.messagesOf.set(conversation, [...(this.messagesOf.get(conversation) ?? []), sent]);
    return { outcome: "sent", message: sent };
  }

  watch(listener: (source: MessagingId) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Adds an agent's reply to its chat. */
  reply(from: MessagingAgent, body: string, sentAt: string): void {
    const conversation = `chat-${from.name}`;
    const reply = message(conversation, body, sentAt, from);
    this.messagesOf.set(conversation, [...(this.messagesOf.get(conversation) ?? []), reply]);
  }

  /** Tells every watcher that `source` changed. */
  change(source: MessagingId): void {
    for (const listener of this.listeners) listener(source);
  }
}
