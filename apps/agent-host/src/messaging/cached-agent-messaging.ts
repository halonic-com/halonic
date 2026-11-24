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
import { searchCached } from "./cached-search.ts";
import { keptAgent, keptConversation, keptInboxItem, keptMessage, keptWork } from "./kept-items.ts";
import { type CachedList, MessagingCacheFolder } from "./messaging-cache-folder.ts";

/** Where a {@link CachedAgentMessaging} keeps its cache. */
export interface CachedAgentMessagingOptions {
  /** The cache folder, in the app data folder. */
  folder: string;
  /** Every workspace folder the host serves; the cache folder must be outside each. */
  workspaceRoots: readonly string[];
  /** Says which cache file was broken and read as missing, so it isn't dropped silently. */
  warn: (message: string) => void;
}

/** What a read gave: its items, or the error it threw. */
type Outcome<Value> = { ok: true; value: Value } | { ok: false; error: unknown };

/**
 * An {@link AgentMessaging} that keeps what each read of `live` returned, so
 * an offline source still shows its items (requirement
 * `agent-host.agent-messaging-cache`, ADR 2026-11-24, agent messaging).
 *
 * After every read it asks `live` which sources are online. An online
 * source's items are saved, one file per list and per conversation, holding
 * only the port's fields. An offline source's items come from the cache, and
 * the source reads as offline as of its last cached live read. Writes go
 * straight to `live`, which sends them or refuses them; nothing is kept to
 * send later. `clear` deletes a source's cache when it is disconnected.
 */
export class CachedAgentMessaging implements AgentMessaging {
  readonly #live: AgentMessaging;
  readonly #cache: MessagingCacheFolder;

  constructor(live: AgentMessaging, options: CachedAgentMessagingOptions) {
    this.#live = live;
    this.#cache = new MessagingCacheFolder(options.folder, options.workspaceRoots, options.warn);
  }

  async listSources(): Promise<readonly MessagingSource[]> {
    const sources = await this.#live.listSources();
    return Promise.all(sources.map((source) => this.#asOfCache(source)));
  }

  listAgents(): Promise<readonly MessagingAgent[]> {
    return this.#readList("agents", () => this.#live.listAgents(), keptAgent);
  }

  async listConversations(): Promise<readonly Conversation[]> {
    const conversations = await this.#readList(
      "conversations",
      () => this.#live.listConversations(),
      keptConversation,
    );
    return newestFirst(conversations, (conversation) => conversation.updatedAt);
  }

  async listMessages(conversation: MessagingId): Promise<readonly Message[]> {
    const live = await outcomeOf(() => this.#live.listMessages(conversation));
    const sources = await this.#live.listSources();
    const source = await this.#sourceOfConversation(sources, conversation);
    if (source?.state.kind === "offline") {
      const cached = await this.#cache.loadMessages<Message>(source.id, conversation);
      return cached?.items ?? [];
    }
    if (!live.ok) throw live.error;
    const messages = live.value.map(keptMessage);
    if (source?.state.kind === "online") {
      await this.#cache.saveMessages(source.id, conversation, {
        asOf: source.state.asOf,
        items: messages,
      });
    }
    return messages;
  }

  async listInboxItems(): Promise<readonly InboxItem[]> {
    const items = await this.#readList("inbox", () => this.#live.listInboxItems(), keptInboxItem);
    return newestFirst(items, (item) => item.createdAt);
  }

  async listWork(): Promise<readonly WorkItem[]> {
    const work = await this.#readList("work", () => this.#live.listWork(), keptWork);
    return newestFirst(work, (each) => each.updatedAt);
  }

  async search(text: string): Promise<readonly SearchHit[]> {
    const live = await outcomeOf(() => this.#live.search(text));
    const sources = await this.#live.listSources();
    const offline = sources.filter((source) => source.state.kind === "offline");
    if (!live.ok && !canAnswerFromCache(sources)) throw live.error;
    const offlineIds = new Set(offline.map((source) => source.id));
    const hits = live.ok ? live.value.filter((hit) => !offlineIds.has(hit.source)) : [];
    const cached = await Promise.all(
      offline.map((source) => searchCached(this.#cache, source.id, text)),
    );
    return [...hits, ...cached.flat()];
  }

  /** Goes straight to the source, which answers or refuses; offline, it is never kept to send later. */
  answer(item: MessagingId, answer: InboxAnswer): Promise<AnswerResult> {
    return this.#live.answer(item, answer);
  }

  /** A file's bytes come only from the source, never from the cache; an offline source refuses. */
  readAttachment(attachment: MessagingId): Promise<AttachmentRead> {
    return this.#live.readAttachment(attachment);
  }

  /** Goes straight to the source, which sends or refuses; offline, it is never kept to send later. */
  send(
    conversation: MessagingId,
    body: string,
    attachments?: readonly OutgoingAttachment[],
    options?: MessageSendOptions,
  ): Promise<SendResult> {
    if (options !== undefined) return this.#live.send(conversation, body, attachments, options);
    return attachments === undefined
      ? this.#live.send(conversation, body)
      : this.#live.send(conversation, body, attachments);
  }

  // Channel calls go straight to the source too: they change a channel, and the cache keeps only
  // what a read gave.

  startChannel(
    title: string,
    members: readonly MessagingId[],
    lead: MessagingId,
  ): Promise<ChannelResult> {
    return this.#live.startChannel(title, members, lead);
  }

  setMembers(
    channel: MessagingId,
    members: readonly MessagingId[],
    lead: MessagingId,
  ): Promise<ChannelResult> {
    return this.#live.setMembers(channel, members, lead);
  }

  browseChannels(): Promise<readonly Conversation[]> {
    return this.#live.browseChannels();
  }

  joinChannel(channel: MessagingId): Promise<ChannelResult> {
    return this.#live.joinChannel(channel);
  }

  leaveChannel(channel: MessagingId): Promise<ChannelResult> {
    return this.#live.leaveChannel(channel);
  }

  changes(): AsyncIterable<MessagingId> {
    return this.#live.changes();
  }

  /** Deletes everything cached for `source`, as disconnecting it does. */
  clear(source: MessagingId): Promise<void> {
    return this.#cache.clear(source);
  }

  /**
   * One list from `live` for online sources and from the cache for offline
   * ones. A failed read is answered from the cache only when no source is
   * online and some are offline; otherwise its error stands.
   */
  async #readList<Item extends { source: MessagingId }>(
    list: CachedList,
    read: () => Promise<readonly Item[]>,
    keep: (item: Item) => Item,
  ): Promise<Item[]> {
    const live = await outcomeOf(read);
    const sources = await this.#live.listSources();
    if (!live.ok && !canAnswerFromCache(sources)) throw live.error;
    const liveItems = live.ok ? live.value.map(keep) : [];
    const known = new Set(sources.map((source) => source.id));
    const items = liveItems.filter((item) => !known.has(item.source));
    for (const source of sources) {
      if (source.state.kind === "offline") {
        const cached = await this.#cache.loadList<Item>(source.id, list);
        items.push(...(cached?.items ?? []));
        continue;
      }
      const mine = liveItems.filter((item) => item.source === source.id);
      if (source.state.kind === "online") {
        await this.#cache.saveList(source.id, list, { asOf: source.state.asOf, items: mine });
      }
      items.push(...mine);
    }
    return items;
  }

  /** An offline source reads as offline as of its last cached live read, when it has one. */
  async #asOfCache(source: MessagingSource): Promise<MessagingSource> {
    if (source.state.kind !== "offline") return source;
    const asOf = await this.#cache.lastLiveRead(source.id);
    return asOf === undefined ? source : { ...source, state: { kind: "offline", asOf } };
  }

  /** The source whose cached conversations hold `conversation`, if any does. */
  async #sourceOfConversation(
    sources: readonly MessagingSource[],
    conversation: MessagingId,
  ): Promise<MessagingSource | undefined> {
    for (const source of sources) {
      const cached = await this.#cache.loadList<Conversation>(source.id, "conversations");
      if (cached?.items.some((each) => each.id === conversation)) return source;
    }
    return undefined;
  }
}

async function outcomeOf<Value>(read: () => Promise<Value>): Promise<Outcome<Value>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    return { ok: false, error };
  }
}

/** A failed read stands for "the line is cut" only when nothing is online and something is offline. */
function canAnswerFromCache(sources: readonly MessagingSource[]): boolean {
  const kinds = sources.map((source) => source.state.kind);
  return !kinds.includes("online") && kinds.includes("offline");
}

function newestFirst<Item>(items: Item[], time: (item: Item) => string): Item[] {
  return items.sort((a, b) => time(b).localeCompare(time(a)));
}
