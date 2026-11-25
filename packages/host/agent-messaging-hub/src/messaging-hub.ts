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
  OutgoingAttachment,
  SearchHit,
  SendResult,
  WorkItem,
} from "@halonicjs/ports";
import { joinChanges } from "./joined-changes.ts";
import { OwnerIndex } from "./owner-index.ts";

/**
 * A provider the hub joins: an {@link AgentMessaging} for its own
 * connections. One that reads a remote source also has `refresh`, which reads
 * it again and names the source on `changes` when something changed, as the
 * Paperclip provider does; the hub's poller calls it.
 */
export interface MessagingProvider extends AgentMessaging {
  refresh?(): Promise<void>;
}

/** A provider and the name its failures are reported under, such as `paperclip:acme`. Never shown to apps. */
export interface NamedMessagingProvider {
  name: string;
  messaging: MessagingProvider;
}

/** A provider's call that failed while the others went on. */
export interface MessagingFailure {
  provider: string;
  /** The call, such as `listInboxItems` or `refresh`. */
  action: string;
  error: unknown;
}

/** What a {@link MessagingHub} joins and where it reports a provider's failure. */
export interface MessagingHubOptions {
  providers: readonly NamedMessagingProvider[];
  /** Hears every provider failure the hub carries on past; the host logs it. */
  report: (failure: MessagingFailure) => void;
}

/**
 * The engine's one {@link AgentMessaging}: it joins every provider's sources
 * (requirement `agent-host.messaging-hub`, ADR 2026-11-24, agent messaging).
 * Lists are merged and kept in the port's order. An answer or a message goes
 * only to the provider that listed the item or conversation; an ID no
 * provider listed is refused with `not-found` and reaches no provider. A
 * provider that fails a read is reported and left out, and the others'
 * items still come back; only when every provider fails does the read fail.
 * An attachment's bytes are read only from the provider that listed it on an
 * inbox item or a message (`agent-host.messaging-hub-attachments`), and an
 * agent's picture only from the one that listed the agent (`ports.agent-messaging-avatars`).
 *
 * @example
 * const hub = new MessagingHub({ providers: [{ name: "paperclip:acme", messaging }], report: log });
 * const open = (await hub.listInboxItems()).filter((item) => item.state.kind === "open");
 */
export class MessagingHub implements AgentMessaging {
  readonly #providers: readonly NamedMessagingProvider[];
  readonly #report: (failure: MessagingFailure) => void;
  readonly #inboxOwners: OwnerIndex;
  readonly #conversationOwners: OwnerIndex;
  readonly #inboxAttachmentOwners: OwnerIndex;
  readonly #avatarOwners: OwnerIndex;
  /** Per conversation, who listed it and the files its messages carry; replaced on each read of it. */
  readonly #messageAttachments = new Map<MessagingId, ConversationFiles>();

  constructor(options: MessagingHubOptions) {
    this.#providers = options.providers;
    this.#report = options.report;
    this.#inboxOwners = new OwnerIndex(options.providers.length);
    this.#conversationOwners = new OwnerIndex(options.providers.length);
    this.#inboxAttachmentOwners = new OwnerIndex(options.providers.length);
    this.#avatarOwners = new OwnerIndex(options.providers.length);
  }

  async listSources(): Promise<readonly MessagingSource[]> {
    return joined(await this.#readAll("listSources", (each) => each.listSources()));
  }

  async listAgents(): Promise<readonly MessagingAgent[]> {
    const lists = await this.#readAll("listAgents", (each) => each.listAgents());
    lists.forEach((list, index) => {
      if (list !== undefined)
        this.#avatarOwners.record(
          index,
          list.flatMap((each) => each.avatar ?? []),
        );
    });
    return joined(lists);
  }

  async listConversations(): Promise<readonly Conversation[]> {
    const lists = await this.#readAll("listConversations", (each) => each.listConversations());
    this.#remember(this.#conversationOwners, lists);
    return newestFirst(joined(lists), (conversation) => conversation.updatedAt);
  }

  async listMessages(conversation: MessagingId): Promise<readonly Message[]> {
    const owner = await this.#conversationOwner(conversation);
    if (owner === undefined) return [];
    const messages = await owner.messaging.listMessages(conversation);
    this.#messageAttachments.set(conversation, {
      provider: this.#providers.indexOf(owner),
      ids: new Set(messages.flatMap(attachmentIds)),
    });
    return messages;
  }

  async listInboxItems(): Promise<readonly InboxItem[]> {
    const lists = await this.#readAll("listInboxItems", (each) => each.listInboxItems());
    this.#remember(this.#inboxOwners, lists);
    lists.forEach((list, index) => {
      if (list !== undefined)
        this.#inboxAttachmentOwners.record(index, list.flatMap(attachmentIds));
    });
    return newestFirst(joined(lists), (item) => item.createdAt);
  }

  async listWork(): Promise<readonly WorkItem[]> {
    const lists = await this.#readAll("listWork", (each) => each.listWork());
    return newestFirst(joined(lists), (work) => work.updatedAt);
  }

  async search(text: string): Promise<readonly SearchHit[]> {
    return joined(await this.#readAll("search", (each) => each.search(text)));
  }

  async answer(item: MessagingId, answer: InboxAnswer): Promise<AnswerResult> {
    const owner = await this.#inboxOwner(item);
    if (owner === undefined) return { outcome: "refused", reason: "not-found" };
    return owner.messaging.answer(item, answer);
  }

  async readAttachment(attachment: MessagingId): Promise<AttachmentRead> {
    const owner = await this.#ownerOf(
      attachment,
      (id) => this.#attachmentOwners(id),
      async () => {
        // The Inbox first, so an agent list that fails never breaks reading a card's file.
        await this.listInboxItems();
        if (this.#attachmentOwners(attachment).length === 0) await this.listAgents();
      },
    );
    if (owner === undefined) return { outcome: "refused", reason: "not-found" };
    return owner.messaging.readAttachment(attachment);
  }

  async send(
    conversation: MessagingId,
    body: string,
    attachments?: readonly OutgoingAttachment[],
    options?: MessageSendOptions,
  ): Promise<SendResult> {
    const owner = await this.#conversationOwner(conversation);
    if (owner === undefined) return { outcome: "refused", reason: "not-found" };
    const result = await owner.messaging.send(conversation, body, attachments, options);
    if (result.outcome === "sent") this.#rememberSent(conversation, owner, result.message);
    return result;
  }

  // Channels aren't joined across providers yet: the hub lists none and
  // refuses every channel write, so no provider is asked (AgentMessaging version 4).

  startChannel(
    _title: string,
    _members: readonly MessagingId[],
    _lead: MessagingId,
  ): Promise<ChannelResult> {
    return notSupported();
  }

  setMembers(
    _channel: MessagingId,
    _members: readonly MessagingId[],
    _lead: MessagingId,
  ): Promise<ChannelResult> {
    return notSupported();
  }

  browseChannels(): Promise<readonly Conversation[]> {
    return Promise.resolve([]);
  }

  joinChannel(_channel: MessagingId): Promise<ChannelResult> {
    return notSupported();
  }

  leaveChannel(_channel: MessagingId): Promise<ChannelResult> {
    return notSupported();
  }

  changes(): AsyncIterable<MessagingId> {
    const streams = this.#providers.map((provider) => provider.messaging.changes());
    return joinChanges(streams, (index, error) => this.#failed(index, "changes", error));
  }

  /**
   * Reads every provider that has `refresh` again, all at once. Each one
   * names its source on `changes` when something changed; a provider that
   * fails is reported, never thrown, so one bad connection doesn't stop the
   * others' polls (`agent-host.paperclip-polling`).
   */
  async refresh(): Promise<void> {
    await Promise.all(
      this.#providers.map(async ({ messaging }, index) => {
        try {
          await messaging.refresh?.();
        } catch (error) {
          this.#failed(index, "refresh", error);
        }
      }),
    );
  }

  /**
   * Each provider's answer to one read, or `undefined` for a provider that
   * failed (reported). Throws when every provider failed, so an app shows an
   * error rather than an Inbox that only looks empty.
   */
  async #readAll<Item>(
    action: string,
    read: (messaging: MessagingProvider) => Promise<readonly Item[]>,
  ): Promise<(readonly Item[] | undefined)[]> {
    const settled = await Promise.allSettled(
      this.#providers.map((provider) => read(provider.messaging)),
    );
    const errors: unknown[] = [];
    const lists = settled.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      errors.push(result.reason);
      this.#failed(index, action, result.reason);
      return undefined;
    });
    if (errors.length > 0 && errors.length === this.#providers.length) {
      throw new AggregateError(errors, `Every messaging provider failed ${action}.`);
    }
    return lists;
  }

  /** Records who listed which ID; a provider that failed this read keeps what it listed before. */
  #remember(owners: OwnerIndex, lists: readonly (readonly { id: MessagingId }[] | undefined)[]) {
    lists.forEach((list, index) => {
      if (list !== undefined)
        owners.record(
          index,
          list.map((each) => each.id),
        );
    });
  }

  /** Adds the files of a message just sent, so the person can open them before the next read. */
  #rememberSent(conversation: MessagingId, owner: NamedMessagingProvider, message: Message): void {
    const provider = this.#providers.indexOf(owner);
    const known = this.#messageAttachments.get(conversation);
    const ids = known?.provider === provider ? known.ids : new Set<MessagingId>();
    for (const id of attachmentIds(message)) ids.add(id);
    this.#messageAttachments.set(conversation, { provider, ids });
  }

  /** The providers that listed a file, on an inbox item or on a conversation's messages, or an agent's picture. */
  #attachmentOwners(id: MessagingId): number[] {
    const owners = new Set([
      ...this.#inboxAttachmentOwners.ownersOf(id),
      ...this.#avatarOwners.ownersOf(id),
    ]);
    for (const files of this.#messageAttachments.values()) {
      if (files.ids.has(id)) owners.add(files.provider);
    }
    return [...owners];
  }

  #inboxOwner(item: MessagingId): Promise<NamedMessagingProvider | undefined> {
    return this.#ownerOf(
      item,
      (id) => this.#inboxOwners.ownersOf(id),
      () => this.listInboxItems(),
    );
  }

  #conversationOwner(conversation: MessagingId): Promise<NamedMessagingProvider | undefined> {
    return this.#ownerOf(
      conversation,
      (id) => this.#conversationOwners.ownersOf(id),
      () => this.listConversations(),
    );
  }

  /**
   * The one provider that listed `id`. An ID the hub hasn't seen (say, just
   * after the host started) gets one more read of that list first. An ID no
   * provider listed, or more than one did, has no owner.
   */
  async #ownerOf(
    id: MessagingId,
    ownersOf: (id: MessagingId) => readonly number[],
    readAgain: () => Promise<unknown>,
  ): Promise<NamedMessagingProvider | undefined> {
    if (ownersOf(id).length === 0) await readAgain();
    const found = ownersOf(id);
    if (found.length !== 1) return undefined;
    return this.#providers[found[0] ?? -1];
  }

  #failed(index: number, action: string, error: unknown): void {
    this.#report({ provider: this.#providers[index]?.name ?? "unknown", action, error });
  }
}

/** Which provider listed a conversation, and the IDs of the files on its messages. */
interface ConversationFiles {
  provider: number;
  ids: Set<MessagingId>;
}

/** The IDs of the files on an inbox item or a message. */
function attachmentIds(item: { attachments: readonly { id: MessagingId }[] }): MessagingId[] {
  return item.attachments.map((attachment) => attachment.id);
}

/** A channel write the hub doesn't route yet. */
function notSupported(): Promise<ChannelResult> {
  return Promise.resolve({ outcome: "refused", reason: "not-supported" });
}

/** The lists of the providers that answered, one after the other. */
function joined<Item>(lists: readonly (readonly Item[] | undefined)[]): Item[] {
  return lists.flatMap((list) => list ?? []);
}

/** Merges lists newest first by `time`; items with the same time keep their providers' order. */
function newestFirst<Item>(items: Item[], time: (item: Item) => string): Item[] {
  return items.sort((a, b) => Date.parse(time(b)) - Date.parse(time(a)));
}
