import type {
  AgentMessaging,
  AnswerResult,
  Conversation,
  InboxAnswer,
  InboxItem,
  Message,
  MessagingAgent,
  MessagingAuthor,
  MessagingId,
  MessagingSource,
  SearchHit,
  SendResult,
  WorkItem,
} from "@halonicjs/ports";
import { Feed } from "./feed.ts";

/** What a {@link FakeAgentMessaging} stamps its times with. */
export interface FakeAgentMessagingOptions {
  /** Defaults to 24 Nov 2026, 10:00 UTC, always. */
  now?: () => Date;
}

/** Everything a source holds, live or as it was when its line was cut. */
interface Held {
  agents: MessagingAgent[];
  conversations: Conversation[];
  messages: Message[];
  inbox: InboxItem[];
  work: WorkItem[];
}

const me: MessagingAuthor = { kind: "me" };

/** The source of an item that names one. */
const bySource = (item: { source: MessagingId }): MessagingId => item.source;

/**
 * An {@link AgentMessaging} that lives in the process, so Studio's Inbox,
 * Messenger and overview can be built and tested before any provider exists
 * (requirement `contracts.fake-agent-messaging`). Its IDs are opaque, like a
 * real provider's, and never a task key.
 *
 * A test adds sources and fills them with `addAgent`, `addConversation`,
 * `addMessage`, `addInboxItem` and `addWork`, plays another client with
 * `answerElsewhere`, and cuts a source's line with `goOffline`. Offline, that
 * source's items read as they were when the line was cut, and writes to it
 * are refused with `offline`, never queued.
 *
 * @example
 * const messaging = new FakeAgentMessaging();
 * const source = messaging.addSource({ label: "Paperclip · Acme" });
 * const chief = messaging.addAgent(source.id, { name: "Chief" });
 * const chat = messaging.addConversation(chief.id);
 */
export class FakeAgentMessaging implements AgentMessaging {
  private readonly now: () => Date;
  private readonly sources: MessagingSource[] = [];
  private readonly live: Held = {
    agents: [],
    conversations: [],
    messages: [],
    inbox: [],
    work: [],
  };
  private readonly frozen = new Map<MessagingId, Held>();
  private readonly readers = new Set<Feed<MessagingId>>();
  private made = 0;

  constructor(options: FakeAgentMessagingOptions = {}) {
    this.now = options.now ?? (() => new Date("2026-11-24T10:00:00.000Z"));
  }

  listSources(): Promise<readonly MessagingSource[]> {
    return Promise.resolve(copy(this.sources));
  }

  listAgents(): Promise<readonly MessagingAgent[]> {
    return Promise.resolve(this.read((held) => held.agents, bySource));
  }

  listConversations(): Promise<readonly Conversation[]> {
    const conversations = this.read((held) => held.conversations, bySource);
    return Promise.resolve(conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  listMessages(conversation: MessagingId): Promise<readonly Message[]> {
    const messages = this.readMessages();
    return Promise.resolve(messages.filter((message) => message.conversation === conversation));
  }

  listInboxItems(): Promise<readonly InboxItem[]> {
    return Promise.resolve(this.read((held) => held.inbox, bySource).reverse());
  }

  listWork(): Promise<readonly WorkItem[]> {
    const work = this.read((held) => held.work, bySource);
    return Promise.resolve(work.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  search(text: string): Promise<readonly SearchHit[]> {
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
    const hits: SearchHit[] = [
      ...this.read((held) => held.agents, bySource).flatMap((a) =>
        hit("agent", a.id, a.source, a.name, a.title ?? ""),
      ),
      ...this.read((held) => held.conversations, bySource).flatMap((c) =>
        hit("conversation", c.id, c.source, c.title, ""),
      ),
      ...this.readMessages().flatMap((m) =>
        hit("message", m.id, this.sourceOfConversation(m.conversation), "", m.body),
      ),
      ...this.read((held) => held.inbox, bySource).flatMap((i) =>
        hit("inbox-item", i.id, i.source, "", i.question),
      ),
      ...this.read((held) => held.work, bySource).flatMap((w) =>
        hit("work", w.id, w.source, w.label, w.title),
      ),
    ];
    return Promise.resolve(hits);
  }

  answer(item: MessagingId, answer: InboxAnswer): Promise<AnswerResult> {
    const found = this.live.inbox.find((each) => each.id === item);
    if (found === undefined) return Promise.resolve({ outcome: "refused", reason: "not-found" });
    const refusal = this.refusal(found.source);
    if (refusal !== undefined) return Promise.resolve({ outcome: "refused", reason: refusal });
    if (found.state.kind === "answered") {
      const { by, answeredAt } = found.state;
      return Promise.resolve({ outcome: "already-answered", by, answeredAt });
    }
    const answeredAt = this.stamp();
    found.state = { kind: "answered", by: me, answer, answeredAt };
    this.changed(found.source);
    return Promise.resolve({ outcome: "answered", answeredAt });
  }

  send(conversation: MessagingId, body: string): Promise<SendResult> {
    const found = this.live.conversations.find((each) => each.id === conversation);
    if (found === undefined) return Promise.resolve({ outcome: "refused", reason: "not-found" });
    const refusal = this.refusal(found.source);
    if (refusal !== undefined) return Promise.resolve({ outcome: "refused", reason: refusal });
    const message = this.addMessage(found.id, { author: me, body });
    found.waitingForMe = false;
    return Promise.resolve({ outcome: "sent", message: copy(message) });
  }

  changes(): AsyncIterable<MessagingId> {
    const feed = new Feed<MessagingId>((left) => this.readers.delete(left));
    this.readers.add(feed);
    return feed;
  }

  /** Adds a source that is online and was read just now. */
  addSource(source: { label: string; provider?: string }): MessagingSource {
    const added: MessagingSource = {
      id: this.newId(),
      provider: source.provider ?? "fake",
      label: source.label,
      state: { kind: "online", asOf: this.stamp() },
    };
    this.sources.push(added);
    return copy(added);
  }

  /** Adds an idle agent to a source. */
  addAgent(source: MessagingId, agent: { name: string } & Partial<MessagingAgent>): MessagingAgent {
    return this.add("agents", source, { id: this.newId(), source, activity: "idle", ...agent });
  }

  /** Adds a conversation with an agent, titled with its name. */
  addConversation(agent: MessagingId, conversation: Partial<Conversation> = {}): Conversation {
    const owner = this.live.agents.find((each) => each.id === agent);
    if (owner === undefined) throw new Error(`no agent has the id ${agent}`);
    const added: Conversation = {
      id: this.newId(),
      source: owner.source,
      agent,
      title: owner.name,
      updatedAt: this.stamp(),
      waitingForMe: false,
      ...conversation,
    };
    return this.add("conversations", owner.source, added);
  }

  /** Adds a message to a conversation, from its agent unless told otherwise; an agent's message waits for the person. */
  addMessage(
    conversation: MessagingId,
    message: { body: string; author?: MessagingAuthor },
  ): Message {
    const found = this.live.conversations.find((each) => each.id === conversation);
    if (found === undefined) throw new Error(`no conversation has the id ${conversation}`);
    const author = message.author ?? this.agentAuthor(found.agent);
    const added: Message = {
      id: this.newId(),
      conversation,
      author,
      body: message.body,
      sentAt: this.stamp(),
    };
    found.updatedAt = added.sentAt;
    found.waitingForMe = author.kind === "agent";
    return this.add("messages", found.source, added);
  }

  /** Adds an open inbox item with the options Yes and No unless told otherwise. */
  addInboxItem(source: MessagingId, item: { question: string } & Partial<InboxItem>): InboxItem {
    const added: InboxItem = {
      id: this.newId(),
      source,
      from: { kind: "person", name: "Someone" },
      options: [
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ],
      createdAt: this.stamp(),
      state: { kind: "open" },
      ...item,
    };
    return this.add("inbox", source, added);
  }

  /** Adds a piece of work, `todo` and blocked by nothing unless told otherwise. */
  addWork(
    source: MessagingId,
    work: { label: string; title: string } & Partial<WorkItem>,
  ): WorkItem {
    const added: WorkItem = {
      id: this.newId(),
      source,
      state: "todo",
      blockedBy: [],
      updatedAt: this.stamp(),
      ...work,
    };
    return this.add("work", source, added);
  }

  /** Another client answers an inbox item first. */
  answerElsewhere(item: MessagingId, by: MessagingAuthor, answer: InboxAnswer): void {
    const found = this.live.inbox.find((each) => each.id === item);
    if (found === undefined) throw new Error(`no inbox item has the id ${item}`);
    found.state = { kind: "answered", by, answer, answeredAt: this.stamp() };
    this.changed(found.source);
  }

  /** Cuts a source's line: its items read as they are now, as of its last read, and writes to it are refused. */
  goOffline(source: MessagingId): void {
    const held = this.sourceOf(source);
    if (held.state.kind !== "online") return;
    const pick = <Item extends { source: MessagingId }>(items: Item[]) =>
      copy(items.filter((each) => each.source === source));
    const messages = this.live.messages.filter(
      (each) => this.sourceOfConversation(each.conversation) === source,
    );
    this.frozen.set(source, {
      agents: pick(this.live.agents),
      conversations: pick(this.live.conversations),
      messages: copy(messages),
      inbox: pick(this.live.inbox),
      work: pick(this.live.work),
    });
    held.state = { kind: "offline", asOf: held.state.asOf };
    this.changed(source, true);
  }

  /** Restores a source's line: it reads live again, as of now. */
  goOnline(source: MessagingId): void {
    this.frozen.delete(source);
    this.sourceOf(source).state = { kind: "online", asOf: this.stamp() };
    this.changed(source);
  }

  /** Live items of online sources, and what offline sources held when their line was cut. */
  private read<Item>(pick: (held: Held) => Item[], sourceOf: (item: Item) => MessagingId): Item[] {
    const live = pick(this.live).filter((item) => !this.frozen.has(sourceOf(item)));
    const frozen = [...this.frozen.values()].flatMap(pick);
    return copy([...live, ...frozen]);
  }

  private readMessages(): Message[] {
    return this.read(
      (held) => held.messages,
      (message) => this.sourceOfConversation(message.conversation),
    );
  }

  private add<Key extends keyof Held>(
    key: Key,
    source: MessagingId,
    item: Held[Key][number],
  ): Held[Key][number] {
    this.sourceOf(source);
    (this.live[key] as Held[Key][number][]).push(item);
    this.changed(source);
    return copy(item);
  }

  /** The source's sign-in ends, as when its key expired or was revoked: writes to it are refused. */
  signOut(source: MessagingId): void {
    this.sourceOf(source).state = { kind: "signed-out" };
    this.changed(source, true);
  }

  private refusal(source: MessagingId): "offline" | "signed-out" | undefined {
    const state = this.sourceOf(source).state.kind;
    return state === "online" ? undefined : state;
  }

  private sourceOf(source: MessagingId): MessagingSource {
    const found = this.sources.find((each) => each.id === source);
    if (found === undefined) throw new Error(`no source has the id ${source}`);
    return found;
  }

  private sourceOfConversation(conversation: MessagingId): MessagingId {
    return this.live.conversations.find((each) => each.id === conversation)?.source ?? "";
  }

  private agentAuthor(agent: MessagingId): MessagingAuthor {
    const found = this.live.agents.find((each) => each.id === agent);
    return { kind: "agent", agent, name: found?.name ?? "Agent" };
  }

  /** Tells every reader the source changed. A change behind a cut line shows only once it is back. */
  private changed(source: MessagingId, evenOffline = false): void {
    if (this.frozen.has(source) && !evenOffline) return;
    for (const reader of this.readers) reader.push(source);
  }

  private newId(): MessagingId {
    this.made += 1;
    return `fake-${this.made}`;
  }

  private stamp(): string {
    return this.now().toISOString();
  }
}

/** A deep copy of plain data, so a test can't change the fake's items through what a read gave. */
function copy<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}
