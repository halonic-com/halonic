import type { StepperCatalog } from "@halonicjs/action-steppers";
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
import { checkedOrigin } from "./address.ts";
import { readAvatar } from "./avatars.ts";
import { boardRequestOf } from "./board-requests.ts";
import { PaperclipBotNotes } from "./bot-notes.ts";
import { ChangeFeed } from "./changes.ts";
import { PaperclipChannelMembers } from "./channel-members.ts";
import { PaperclipChannelSender } from "./channel-send.ts";
import { PaperclipChannelWork } from "./channel-work.ts";
import { withReadAt } from "./chat-signals.ts";
import { PaperclipCommentThreads } from "./comment-threads.ts";
import { PaperclipConversations } from "./conversations.ts";
import { PaperclipFullAnswers } from "./full-answers.ts";
import { PaperclipIds } from "./ids.ts";
import { PaperclipInbox } from "./inbox.ts";
import { asRecords, type JsonRecord, text } from "./json.ts";
import { type MapContext, newestFirst, toAgent, toMessage, toWork } from "./map.ts";
import { PaperclipReader } from "./reader.ts";
import { type RefreshLists, RefreshReads } from "./refresh-reads.ts";
import { isSafeSegment } from "./requests.ts";
import { searchAll } from "./search.ts";
import { type PaperclipUser, SignedInUser } from "./signed-in-user.ts";
import { PaperclipSteppers } from "./steppers.ts";
import { type PaperclipLists, paperclipSync } from "./sync-collections.ts";
import { PaperclipClientError, PaperclipTransport, type TransportOptions } from "./transport.ts";
import { PaperclipWebLinks } from "./web-links.ts";
import { PaperclipWriter } from "./writer.ts";

/** One Paperclip connection, as the engine hands it in. The key stays in memory only. */
export interface PaperclipMessagingOptions extends TransportOptions {
  /** The connection's name, from `connections/paperclip/<name>.yaml`; part of every ID. */
  connection: string;
  /** The Paperclip company the connection reads. */
  company: string;
  /** What the user reads next to every item, such as "Paperclip · Acme". */
  label: string;
  /** The Paperclip user the key belongs to, so their own messages read as "me". */
  userId?: string;
  /** The catalog stepper requests are checked against; without one, cards that pin one stay plain cards. */
  stepperCatalog?: StepperCatalog;
  now?: () => Date;
  /**
   * Where a read that need not fail a list is reported, such as a chat's full answers. Without
   * it, that read's failure fails the list.
   */
  warn?: (message: string) => void;
}

export type { PaperclipUser } from "./signed-in-user.ts";

/** How many of Paperclip's matching tasks a search reads. */
const searchPage = "50";

/**
 * The Paperclip provider: {@link AgentMessaging} for one Paperclip
 * connection, over plain `fetch` (ADR 2026-11-24, agent messaging). The
 * engine creates one per connection, polls it with {@link refresh} and joins
 * its source with the others'. It makes only the requests on
 * `paperclipRequests`.
 */
export class PaperclipMessaging implements AgentMessaging {
  readonly #ids: PaperclipIds;
  readonly #company: string;
  readonly #label: string;
  readonly #origin: string;
  readonly #user: SignedInUser;
  readonly #reader: PaperclipReader;
  readonly #inbox: PaperclipInbox;
  readonly #writer: PaperclipWriter;
  readonly #channels: PaperclipChannelSender;
  readonly #members: PaperclipChannelMembers;
  readonly #channelWork: PaperclipChannelWork;
  readonly #fullAnswers: PaperclipFullAnswers;
  readonly #botNotes: PaperclipBotNotes;
  readonly #threads: PaperclipCommentThreads;
  readonly #conversations: PaperclipConversations;
  readonly #refreshReads: RefreshReads;
  readonly #feed = new ChangeFeed<MessagingId>();
  readonly #now: () => Date;
  #agentNames = new Map<string, string>();
  /** The Inbox as last read, which search matches without reading every task's cards again. */
  #lastInbox: readonly InboxItem[] = [];
  #lastSeen: string | undefined;

  constructor(options: PaperclipMessagingOptions) {
    const now = options.now ?? (() => new Date());
    this.#now = now;
    this.#ids = new PaperclipIds(options.connection);
    this.#company = options.company;
    this.#label = options.label;
    this.#origin = checkedOrigin(options.address);
    this.#reader = new PaperclipReader(new PaperclipTransport(options), now);
    this.#user = new SignedInUser(this.#reader, options.userId);
    const steppers =
      options.stepperCatalog && new PaperclipSteppers(this.#reader, options.stepperCatalog);
    const webLinks = new PaperclipWebLinks(options.address);
    this.#inbox = new PaperclipInbox(this.#reader, options.company, webLinks, steppers);
    this.#writer = new PaperclipWriter(this.#reader, this.#company, now, steppers);
    this.#channels = new PaperclipChannelSender(this.#reader, options.company, options.userId, now);
    this.#members = new PaperclipChannelMembers(this.#reader, options.company, options.userId);
    this.#channelWork = new PaperclipChannelWork(this.#reader, options.company, options.userId);
    this.#fullAnswers = new PaperclipFullAnswers(this.#reader, options.warn);
    this.#botNotes = new PaperclipBotNotes(this.#reader, options.company, options.warn, now);
    this.#threads = new PaperclipCommentThreads(this.#reader);
    this.#conversations = new PaperclipConversations(
      this.#reader,
      this.#ids,
      options.company,
      options.userId,
    );
    this.#refreshReads = new RefreshReads(now);
  }

  async listSources(): Promise<readonly MessagingSource[]> {
    return [
      {
        id: this.#ids.source(),
        provider: "paperclip",
        label: this.#label,
        state: this.#reader.state(),
      },
    ];
  }

  async listAgents(): Promise<readonly MessagingAgent[]> {
    return this.#refreshReads.take("agents") ?? this.#readAgents();
  }

  async #readAgents(): Promise<readonly MessagingAgent[]> {
    const records = asRecords(
      await this.#reader.read("listAgents", { path: { company: this.#company } }),
    );
    this.#agentNames = new Map(
      records.flatMap((record) => {
        const id = text(record, "id");
        const name = text(record, "name");
        return id === undefined || name === undefined ? [] : [[id, name] as const];
      }),
    );
    const context = this.#context();
    return records.flatMap((record) => toAgent(context, record) ?? []);
  }

  /** Chats and channels, newest first. A channel is an open parent task (`paperclip-client.channels`). */
  async listConversations(): Promise<readonly Conversation[]> {
    const kept = this.#refreshReads.take("conversations");
    return kept ?? this.#conversations.list(this.#context(), await this.#inbox.openTasks());
  }

  /**
   * A chat's or a channel's messages: the comments on its task, oldest first. A channel's also
   * hold the agents' replies on its child tasks, and work lines under the person's messages
   * (`paperclip-client.channel-work`). A chat's agent replies carry the full answer they link
   * (`paperclip-client.full-answers`).
   */
  async listMessages(conversation: MessagingId): Promise<readonly Message[]> {
    const [channel] = this.#ids.read(conversation, "channel") ?? [];
    const [task] = this.#ids.read(conversation, "chat") ?? (channel === undefined ? [] : [channel]);
    if (task === undefined) {
      return [];
    }
    await this.#knowAgents();
    await this.#user.know();
    const context = this.#context();
    const messages = (await this.#threads.read(task))
      .flatMap((record) => toMessage(context, task, record) ?? [])
      .map((message) => ({ ...message, conversation }));
    if (channel !== undefined) {
      return this.#channelWork.add(context, channel, conversation, messages);
    }
    const answered = await this.#fullAnswers.add(task, messages);
    // A chat not yet listed has no known agent: its `readAt` and bot notes wait for the next read.
    const agent = this.#conversations.agentOf(task);
    if (agent === undefined) {
      return answered;
    }
    const marked = await this.#botNotes.mark(context, { task, agent, conversation }, answered);
    return withReadAt(this.#reader, this.#ids, { task, agent }, marked);
  }

  async listInboxItems(): Promise<readonly InboxItem[]> {
    return this.#refreshReads.take("inboxItems") ?? this.#inboxFrom(undefined);
  }

  async listWork(): Promise<readonly WorkItem[]> {
    return this.#refreshReads.take("work") ?? this.#workFrom(await this.#inbox.openTasks());
  }

  /**
   * Searches through Paperclip's issue search (`q=`) in the connection's
   * company, and matches agents' names, chats' titles and the questions of
   * the Inbox as last read. A blank query makes no request.
   */
  async search(query: string): Promise<readonly SearchHit[]> {
    const needle = query.trim();
    if (needle === "") {
      return [];
    }
    const agents = await this.listAgents();
    const conversations = await this.listConversations();
    const tasks = await this.#reader.read("searchTasks", {
      path: { company: this.#company },
      query: { q: needle, limit: searchPage },
    });
    const lists = { agents, conversations, inbox: this.#lastInbox, tasks: asRecords(tasks) };
    return searchAll(needle, lists, this.#context());
  }

  async answer(item: MessagingId, answer: InboxAnswer): Promise<AnswerResult> {
    this.#refreshReads.forget();
    const target = {
      card: this.#ids.read(item, "card"),
      approval: this.#ids.read(item, "approval"),
      decision: this.#ids.read(item, "decision"),
      boardRequest: boardRequestOf(this.#ids, item),
    };
    const result = await this.#writer.answer(this.#context(), target, answer);
    this.#changedAfter(result.outcome !== "refused");
    return result;
  }

  /**
   * Reads an agent's picture (`ports.agent-messaging-avatars`) or a picture the last Inbox list
   * gave a card (`paperclip-client.card-files`); any other ID is refused before any request.
   */
  async readAttachment(attachment: MessagingId): Promise<AttachmentRead> {
    const [avatar] = this.#ids.read(attachment, "avatar") ?? [];
    return avatar === undefined
      ? this.#inbox.files.read(this.#ids, attachment)
      : readAvatar(this.#reader, avatar);
  }

  async send(
    conversation: MessagingId,
    body: string,
    attachments: readonly OutgoingAttachment[] = [],
    options: MessageSendOptions = {},
  ): Promise<SendResult> {
    this.#refreshReads.forget();
    // Files aren't sent to Paperclip yet, so a message with files is refused whole, before any request.
    if (attachments.length > 0) {
      return { outcome: "refused", reason: "unsupported-type" };
    }
    const [channel] = this.#ids.read(conversation, "channel") ?? [];
    if (channel !== undefined) {
      return this.#sendInChannel(channel, body, options.to ?? []);
    }
    const [task] = this.#ids.read(conversation, "chat") ?? [];
    // An unsafe ID is refused before any request, the chat check's read included.
    if (task === undefined || !isSafeSegment(task)) {
      return { outcome: "refused", reason: "not-found" };
    }
    // The key may comment only on the person's own chats (ADR: "comment on a chat task"),
    // so a stale or made-up chat ID never turns into a comment on some other task.
    const notAChat = await this.#conversations.refusalUnlessChat(
      this.#context(),
      task,
      options.to ?? [],
    );
    if (notAChat !== undefined) {
      return { outcome: "refused", reason: notAChat };
    }
    const sent = await this.#writer.send(task, body);
    if (sent.kind === "refused") {
      return { outcome: "refused", reason: sent.reason };
    }
    await this.#user.know();
    const message = toMessage(this.#context(), task, sent.comment);
    if (message === undefined) {
      throw new PaperclipClientError(
        "Paperclip's answer to POST commentOnChat holds no comment.",
        "bad-answer",
      );
    }
    this.#changedAfter(true);
    return { outcome: "sent", message };
  }

  // Starting a channel, its members, browsing, joining and leaving
  // (`paperclip-client.channel-membership`): writes, so offline each is refused, never queued.

  async startChannel(
    title: string,
    members: readonly MessagingId[],
    lead: MessagingId,
  ): Promise<ChannelResult> {
    this.#refreshReads.forget();
    const result = await this.#members.start(this.#context(), title, members, lead);
    this.#changedAfter(result.outcome === "done");
    return result;
  }

  setMembers(
    channel: MessagingId,
    members: readonly MessagingId[],
    lead: MessagingId,
  ): Promise<ChannelResult> {
    return this.#changeChannel(channel, (context, task) =>
      this.#members.setMembers(context, task, members, lead),
    );
  }

  async browseChannels(): Promise<readonly Conversation[]> {
    return this.#refreshReads.take("channels") ?? this.#browseFrom(await this.#inbox.openTasks());
  }

  joinChannel(channel: MessagingId): Promise<ChannelResult> {
    return this.#changeChannel(channel, (context, task) =>
      this.#members.follow(context, task, true),
    );
  }

  leaveChannel(channel: MessagingId): Promise<ChannelResult> {
    return this.#changeChannel(channel, (context, task) =>
      this.#members.follow(context, task, false),
    );
  }

  changes(): AsyncIterable<MessagingId> {
    return this.#feed.listen();
  }

  /**
   * Reads the source again and tells `changes` readers when anything they
   * show changed. The engine calls it on its schedule (`ports.paperclip-polling`).
   * The list reads right after it answer from what it read
   * (`paperclip-client.refresh-reads`).
   */
  async refresh(): Promise<void> {
    const reading = this.#refreshReads.start();
    // One read of the open tasks serves the Inbox, the chats, the work and the channels.
    const tasks = await this.#inbox.openTasks();
    const agents = this.#agentNames.size === 0 ? await this.#readAgents() : undefined;
    const lists: RefreshLists = {
      inboxItems: await this.#inboxFrom(tasks),
      conversations: await this.#conversations.list(this.#context(), tasks),
      work: this.#workFrom(tasks),
      channels: this.#browseFrom(tasks),
      ...(agents === undefined ? {} : { agents }),
    };
    reading.keep(lists);
    const seen = JSON.stringify([lists.inboxItems, lists.conversations, lists.work]);
    const changed = this.#lastSeen !== undefined && seen !== this.#lastSeen;
    this.#lastSeen = seen;
    if (changed) {
      this.#feed.push(this.#ids.source());
    }
  }

  /**
   * The connection's collections for the engine's local copy (`agent-host.paperclip-sync`): one
   * read of the open tasks serves the Inbox, the conversations and the work list, as in `refresh`.
   */
  sync(): MessagingSync {
    return paperclipSync(() => this.#readLists());
  }

  /**
   * Revokes the key in Paperclip (`POST /api/cli-auth/revoke-current`), as
   * Disconnect does. Answers whether Paperclip revoked it: offline, signed
   * out or refused, it didn't, and the key stays valid until its expiry.
   */
  async revoke(): Promise<boolean> {
    this.#refreshReads.forget();
    const answer = await this.#reader.send("revokeKey");
    this.#refreshReads.forget();
    return answer.kind === "ok";
  }

  /** Reads who the key belongs to (`GET /api/cli-auth/me`); see {@link SignedInUser.read}. */
  signedInUser(): Promise<PaperclipUser | undefined> {
    return this.#user.read();
  }

  #changedAfter(wrote: boolean): void {
    // A `refresh` that began during the write may have read Paperclip before the write landed.
    this.#refreshReads.forget();
    if (wrote) {
      // `#lastSeen` stays: forgetting it would make the next poll a silent first read, and that
      // poll is the one that sees the agent's run start after a send (HAL-19362).
      this.#feed.push(this.#ids.source());
    }
  }

  /** Runs `change` on channel `channel`'s task; an ID that names no channel is `not-found`. */
  async #changeChannel(
    channel: MessagingId,
    change: (context: MapContext, task: string) => Promise<ChannelResult>,
  ): Promise<ChannelResult> {
    this.#refreshReads.forget();
    const [task] = this.#ids.read(channel, "channel") ?? [];
    if (task === undefined || !isSafeSegment(task)) {
      return { outcome: "refused", reason: "not-found" };
    }
    const result = await change(this.#context(), task);
    this.#changedAfter(result.outcome === "done");
    return result;
  }

  async #sendInChannel(
    channel: string,
    body: string,
    to: readonly MessagingId[],
  ): Promise<SendResult> {
    if (!isSafeSegment(channel)) {
      return { outcome: "refused", reason: "not-found" };
    }
    const result = await this.#channels.send(this.#context(), channel, body, to);
    this.#changedAfter(result.outcome === "sent");
    return result;
  }

  async #readLists(): Promise<PaperclipLists> {
    const tasks = await this.#inbox.openTasks();
    // Every sync reads the agents, so a renamed agent's name is right in the lists mapped next.
    const agents = await this.#readAgents();
    const inbox = await this.#inboxFrom(tasks);
    const conversations = await this.#conversations.list(this.#context(), tasks);
    const asOf = this.#inbox.tasksAsOf() ?? this.#now().toISOString();
    return { agents, conversations, inbox, work: this.#workFrom(tasks), asOf };
  }

  async #inboxFrom(tasks: readonly JsonRecord[] | undefined): Promise<InboxItem[]> {
    await this.#knowAgents();
    const items = await this.#inbox.list(this.#context(), tasks);
    this.#lastInbox = items;
    return items;
  }

  #browseFrom(tasks: readonly JsonRecord[]): Conversation[] {
    const channels = this.#members.browse(this.#context(), tasks);
    return newestFirst(channels, (conversation) => conversation.updatedAt);
  }

  #workFrom(tasks: readonly JsonRecord[]): WorkItem[] {
    const context = this.#context();
    const work = tasks.flatMap((record) => toWork(context, record) ?? []);
    return newestFirst(work, (item) => item.updatedAt);
  }

  async #knowAgents(): Promise<void> {
    if (this.#agentNames.size === 0) {
      await this.#readAgents();
    }
  }

  #context(): MapContext {
    return {
      ids: this.#ids,
      agentNames: this.#agentNames,
      origin: this.#origin,
      ...(this.#user.id === undefined ? {} : { userId: this.#user.id }),
    };
  }
}
