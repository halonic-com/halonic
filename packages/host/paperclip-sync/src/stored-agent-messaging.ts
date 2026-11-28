import type {
  AgentMessaging,
  AnswerResult,
  AttachmentRead,
  ChannelResult,
  Conversation,
  InboxAnswer,
  InboxItem,
  Message,
  MessageSendOptions,
  MessagingAgent,
  MessagingId,
  MessagingSource,
  MessagingSync,
  OutgoingAttachment,
  SearchHit,
  SendResult,
  WorkItem,
} from "@halonicjs/ports";
import { ChangeFeed } from "./change-feed.ts";
import type { KeptCollection, KeptCollectionOptions } from "./kept-collection.ts";
import { SyncStore } from "./sync-store.ts";

/** What a {@link StoredAgentMessaging} serves: one provider, its collections and where they are saved. */
export interface StoredAgentMessagingOptions extends KeptCollectionOptions {
  /** The provider, which every write, every message read and every search still goes to. */
  live: AgentMessaging;
  /** The provider's collections, which keep the store current. */
  sync: MessagingSync;
  /** Asked before each sync, such as whether the source is still signed in; `false` skips it. */
  mayRead?: () => Promise<boolean>;
}

/**
 * One provider's {@link AgentMessaging} answered from its local copy (requirement
 * `agent-host.paperclip-sync`): agents, conversations, inbox items and work come from the
 * {@link SyncStore}, so once a sync has filled it a read asks the source nothing. {@link refresh}
 * keeps the store current and names the source on `changes` only when the store changed.
 *
 * Writes still go to the provider, which sends or refuses them, and an accepted answer or message
 * is applied to the store at once. Messages stay a live read, and so does search: the store holds
 * the source's open work only, so a search of it alone would drop closed work without a word.
 */
export class StoredAgentMessaging implements AgentMessaging {
  readonly #live: AgentMessaging;
  readonly #store: SyncStore;
  readonly #source: MessagingId;
  readonly #mayRead: () => Promise<boolean>;
  readonly #feed = new ChangeFeed();
  /** Set by a channel write, whose result holds no list: reads go to the provider until the next sync. */
  #stale = false;

  constructor(options: StoredAgentMessagingOptions) {
    this.#live = options.live;
    this.#store = new SyncStore(options.sync, options);
    this.#source = options.source;
    this.#mayRead = options.mayRead ?? (async () => true);
  }

  listSources(): Promise<readonly MessagingSource[]> {
    return this.#live.listSources();
  }

  listAgents(): Promise<readonly MessagingAgent[]> {
    return this.#read(this.#store.agents, () => this.#live.listAgents());
  }

  listConversations(): Promise<readonly Conversation[]> {
    return this.#read(this.#store.conversations, () => this.#live.listConversations());
  }

  listMessages(conversation: MessagingId): Promise<readonly Message[]> {
    return this.#live.listMessages(conversation);
  }

  listInboxItems(): Promise<readonly InboxItem[]> {
    return this.#read(this.#store.inbox, () => this.#live.listInboxItems());
  }

  listWork(): Promise<readonly WorkItem[]> {
    return this.#read(this.#store.work, () => this.#live.listWork());
  }

  /** Always the provider's own search, which also finds closed work the store doesn't hold. */
  search(text: string): Promise<readonly SearchHit[]> {
    return this.#live.search(text);
  }

  async answer(item: MessagingId, answer: InboxAnswer): Promise<AnswerResult> {
    const result = await this.#live.answer(item, answer);
    if (result.outcome === "answered") {
      const { answeredAt } = result;
      await this.#store.inbox.update(item, (kept) => ({
        ...kept,
        state: { kind: "answered", by: { kind: "me" }, answer, answeredAt },
      }));
      this.#feed.push(this.#source);
    }
    return result;
  }

  readAttachment(attachment: MessagingId): Promise<AttachmentRead> {
    return this.#live.readAttachment(attachment);
  }

  async send(
    conversation: MessagingId,
    body: string,
    attachments?: readonly OutgoingAttachment[],
    options?: MessageSendOptions,
  ): Promise<SendResult> {
    const result = await this.#live.send(conversation, body, attachments, options);
    if (result.outcome === "sent") {
      const { sentAt } = result.message;
      await this.#store.conversations.update(conversation, (kept) => ({
        ...kept,
        updatedAt: sentAt,
        waitingForMe: false,
      }));
      this.#feed.push(this.#source);
    }
    return result;
  }

  startChannel(
    title: string,
    members: readonly MessagingId[],
    lead: MessagingId,
  ): Promise<ChannelResult> {
    return this.#changeChannel(this.#live.startChannel(title, members, lead));
  }

  setMembers(
    channel: MessagingId,
    members: readonly MessagingId[],
    lead: MessagingId,
  ): Promise<ChannelResult> {
    return this.#changeChannel(this.#live.setMembers(channel, members, lead));
  }

  browseChannels(): Promise<readonly Conversation[]> {
    return this.#live.browseChannels();
  }

  joinChannel(channel: MessagingId): Promise<ChannelResult> {
    return this.#changeChannel(this.#live.joinChannel(channel));
  }

  leaveChannel(channel: MessagingId): Promise<ChannelResult> {
    return this.#changeChannel(this.#live.leaveChannel(channel));
  }

  changes(): AsyncIterable<MessagingId> {
    return this.#feed.listen();
  }

  /**
   * Reads the provider's collections and keeps them, unless `mayRead` says no. Names the source
   * on `changes` when the store changed; a failed read throws, and the store keeps what it had.
   */
  async refresh(): Promise<void> {
    if (!(await this.#mayRead())) return;
    const changed = await this.#store.sync();
    this.#stale = false;
    if (changed) this.#feed.push(this.#source);
  }

  /**
   * Reads the provider's collections again with a read that starts after this call, for an answer
   * that must not go out on an old copy (`agent-host.risky-answer-confirm`). Unlike
   * {@link refresh}, it throws when the source may not be read or the read fails.
   */
  async refreshNow(): Promise<void> {
    if (!(await this.#mayRead())) throw new Error("The source can't be read now.");
    const changed = await this.#store.syncAfter();
    this.#stale = false;
    if (changed) this.#feed.push(this.#source);
  }

  /**
   * Deletes the source's local copy for good, as Disconnect does: a sync, answer or send still in
   * flight saves nothing afterwards, and reads go to the provider.
   */
  clear(): Promise<void> {
    return this.#store.clear();
  }

  /**
   * The store's items, kept in memory or saved before this start. Until the first sync, and after
   * a channel write until the next one, the provider answers itself, as it did before the store.
   */
  async #read<Item extends { id: MessagingId }>(
    kept: KeptCollection<Item>,
    live: () => Promise<readonly Item[]>,
  ): Promise<readonly Item[]> {
    const items = this.#stale ? undefined : await kept.items();
    return items ?? live();
  }

  async #changeChannel(write: Promise<ChannelResult>): Promise<ChannelResult> {
    const result = await write;
    if (result.outcome === "done") {
      this.#stale = true;
      this.#feed.push(this.#source);
    }
    return result;
  }
}
