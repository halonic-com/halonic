import {
  type AgentMessaging,
  type AnswerResult,
  type AttachmentRead,
  addresseesFit,
  answerFitsItem,
  type ChannelResult,
  type Conversation,
  channelMembersFit,
  type InboxAnswer,
  type InboxItem,
  type Message,
  type MessageSendOptions,
  type MessagingAgent,
  type MessagingAuthor,
  type MessagingId,
  type MessagingRefusal,
  type MessagingSource,
  type OutgoingAttachment,
  type SearchHit,
  type SendResult,
  type WorkItem,
} from "@halonicjs/ports";
import { FakeAgentFiles, type FakeAttachment } from "./fake-agent-files.ts";
import { searchHits } from "./fake-agent-search.ts";
import { copy, refused } from "./fake-agent-values.ts";
import { Feed } from "./feed.ts";

/** What a {@link FakeAgentMessaging} stamps its times with. */
export interface FakeAgentMessagingOptions {
  /** Defaults to 24 Nov 2026, 10:00 UTC, always. */
  now?: () => Date;
  /**
   * What every ID it makes starts with; `fake` unless told otherwise. Two
   * fakes joined into one, as the engine joins providers, each take their
   * own, so their IDs never collide, as two real providers' never do.
   */
  idPrefix?: string;
  /** The largest file `send` takes, in bytes; 10 MiB unless told otherwise. */
  attachmentLimit?: number;
  /** The file types `send` takes; any unless told otherwise. */
  attachmentTypes?: readonly string[];
  /** `false` plays a source without channels: every channel call is refused with `not-supported`. */
  channels?: boolean;
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
 * `answerElsewhere`, and cuts a source's line with `goOffline`. Items and messages take files
 * (`attachments`), whose bytes only `readAttachment` gives. Offline, that
 * source's items read as they were when the line was cut, and writes to it
 * are refused with `offline`, never queued. A channel is a conversation with
 * `members` (`startChannel`, or `addConversation` with `members`); the person
 * leaves and joins it (requirement `contracts.fake-agent-messaging-channels`).
 *
 * @example
 * const messaging = new FakeAgentMessaging();
 * const source = messaging.addSource({ label: "Paperclip · Acme" });
 * const chief = messaging.addAgent(source.id, { name: "Chief" });
 * const chat = messaging.addConversation(chief.id);
 */
export class FakeAgentMessaging implements AgentMessaging {
  private readonly now: () => Date;
  private readonly idPrefix: string;
  private readonly files: FakeAgentFiles;
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
  /** Channels the person isn't in: `browseChannels` lists them, `listConversations` doesn't. */
  private readonly notIn = new Set<MessagingId>();
  private readonly hasChannels: boolean;
  private made = 0;

  constructor(options: FakeAgentMessagingOptions = {}) {
    this.now = options.now ?? (() => new Date("2026-11-24T10:00:00.000Z"));
    this.idPrefix = options.idPrefix ?? "fake";
    this.files = new FakeAgentFiles(options, () => this.newId());
    this.hasChannels = options.channels ?? true;
  }

  listSources(): Promise<readonly MessagingSource[]> {
    return Promise.resolve(copy(this.sources));
  }

  listAgents(): Promise<readonly MessagingAgent[]> {
    return Promise.resolve(this.read((held) => held.agents, bySource));
  }

  listConversations(): Promise<readonly Conversation[]> {
    const conversations = this.read((held) => held.conversations, bySource).filter(
      (each) => !this.notIn.has(each.id),
    );
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
    const hits = searchHits(text, {
      agents: this.read((held) => held.agents, bySource),
      conversations: this.read((held) => held.conversations, bySource),
      messages: this.readMessages(),
      inbox: this.read((held) => held.inbox, bySource),
      work: this.read((held) => held.work, bySource),
      sourceOfConversation: (conversation) => this.sourceOfConversation(conversation),
    });
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
    if (!answerFitsItem(found, answer)) {
      return Promise.resolve({ outcome: "refused", reason: "bad-answer" });
    }
    const answeredAt = this.stamp();
    found.state = { kind: "answered", by: me, answer, answeredAt };
    this.changed(found.source);
    return Promise.resolve({ outcome: "answered", answeredAt });
  }

  readAttachment(attachment: MessagingId): Promise<AttachmentRead> {
    const found = this.files.find(attachment);
    if (found === undefined) return Promise.resolve({ outcome: "refused", reason: "not-found" });
    const refusal = this.refusal(found.source);
    if (refusal !== undefined) return Promise.resolve({ outcome: "refused", reason: refusal });
    const { bytes, type } = found.file;
    return Promise.resolve({ outcome: "read", bytes: bytes.slice(), type });
  }

  send(
    conversation: MessagingId,
    body: string,
    attachments: readonly OutgoingAttachment[] = [],
    options: MessageSendOptions = {},
  ): Promise<SendResult> {
    const found = this.live.conversations.find((each) => each.id === conversation);
    if (found === undefined) return Promise.resolve({ outcome: "refused", reason: "not-found" });
    const refusal = this.refusal(found.source) ?? this.files.refusal(attachments);
    if (refusal !== undefined) return Promise.resolve({ outcome: "refused", reason: refusal });
    // Only `to` is read from the options, so nothing an app passes can change the author.
    const to = [...(options.to ?? [])];
    if (!addresseesFit(found, to))
      return Promise.resolve({ outcome: "refused", reason: "not-found" });
    const message = this.addMessage(found.id, {
      author: me,
      body,
      attachments,
      ...(to.length > 0 && { to }),
    });
    found.waitingForMe = false;
    return Promise.resolve({ outcome: "sent", message: copy(message) });
  }

  startChannel(
    title: string,
    members: readonly MessagingId[],
    lead: MessagingId,
  ): Promise<ChannelResult> {
    if (!this.hasChannels) return refused("not-supported");
    if (!channelMembersFit(members, lead, this.live.agents)) return refused("bad-members");
    const source = this.live.agents.find((each) => each.id === lead)?.source ?? "";
    const refusal = this.refusal(source);
    if (refusal !== undefined) return refused(refusal);
    const conversation = this.addConversation(lead, { title, members: [...members] });
    return Promise.resolve({ outcome: "done", conversation });
  }

  setMembers(
    channel: MessagingId,
    members: readonly MessagingId[],
    lead: MessagingId,
  ): Promise<ChannelResult> {
    return this.changeChannel(channel, (found) => {
      const sameSource = this.live.agents.find((each) => each.id === lead)?.source === found.source;
      if (!sameSource || !channelMembersFit(members, lead, this.live.agents)) return "bad-members";
      found.members = [...members];
      found.agent = lead;
      return undefined;
    });
  }

  browseChannels(): Promise<readonly Conversation[]> {
    const channels = this.read((held) => held.conversations, bySource);
    return Promise.resolve(channels.filter((each) => this.notIn.has(each.id)));
  }

  joinChannel(channel: MessagingId): Promise<ChannelResult> {
    return this.changeChannel(channel, (found) => {
      this.notIn.delete(found.id);
      return undefined;
    });
  }

  leaveChannel(channel: MessagingId): Promise<ChannelResult> {
    return this.changeChannel(channel, (found) => {
      this.notIn.add(found.id);
      return undefined;
    });
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

  /** Adds an idle agent to a source; a `picture` is its avatar, which `readAttachment` gives. */
  addAgent(
    source: MessagingId,
    agent: { name: string; picture?: FakeAttachment } & Partial<MessagingAgent>,
  ): MessagingAgent {
    const { picture, ...rest } = agent;
    const added = { ...this.files.avatar(source, picture), ...rest };
    return this.add("agents", source, { id: this.newId(), source, activity: "idle", ...added });
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

  /**
   * Adds a message to a conversation, from its agent unless told otherwise; an agent's message
   * waits for the person, except an `automatic` one, which isn't the agent's answer.
   */
  addMessage(
    conversation: MessagingId,
    message: { body: string; attachments?: readonly FakeAttachment[] } & Partial<
      Pick<Message, "author" | "to" | "work" | "automatic" | "fullAnswer">
    >,
  ): Message {
    const found = this.live.conversations.find((each) => each.id === conversation);
    if (found === undefined) throw new Error(`no conversation has the id ${conversation}`);
    const { attachments, ...rest } = message;
    const author = rest.author ?? this.agentAuthor(found.agent);
    const added: Message = {
      id: this.newId(),
      conversation,
      sentAt: this.stamp(),
      ...rest,
      author,
      attachments: this.files.keep(found.source, attachments),
    };
    found.updatedAt = added.sentAt;
    if (added.automatic !== true) found.waitingForMe = author.kind === "agent";
    return this.add("messages", found.source, added);
  }

  /**
   * Adds an open inbox item with the options Yes and No and no files unless told otherwise. Given
   * `action`, it is an action item, with no options unless told otherwise.
   */
  addInboxItem(
    source: MessagingId,
    item: { question: string; files?: readonly FakeAttachment[] } & Partial<InboxItem>,
  ): InboxItem {
    const { files, ...rest } = item;
    const yesNo = [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ];
    const added: InboxItem = {
      id: this.newId(),
      source,
      from: { kind: "person", name: "Someone" },
      options: item.action === undefined ? yesNo : [],
      createdAt: this.stamp(),
      state: { kind: "open" },
      ...rest,
      attachments: rest.attachments ?? this.files.keep(source, files),
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

  /**
   * Changes a live channel unless refused: `not-supported` without channels,
   * `not-found` for no channel by that ID, the source's state, or `change`'s own refusal.
   */
  private changeChannel(
    channel: MessagingId,
    change: (found: Conversation) => MessagingRefusal | undefined,
  ): Promise<ChannelResult> {
    if (!this.hasChannels) return refused("not-supported");
    const found = this.live.conversations.find((each) => each.id === channel);
    if (found?.members === undefined) return refused("not-found");
    const refusal = this.refusal(found.source) ?? change(found);
    if (refusal !== undefined) return refused(refusal);
    this.changed(found.source);
    return Promise.resolve({ outcome: "done", conversation: copy(found) });
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
    return `${this.idPrefix}-${this.made}`;
  }

  private stamp(): string {
    return this.now().toISOString();
  }
}
