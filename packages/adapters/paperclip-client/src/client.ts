import type { StepperCatalog } from "@halonicjs/action-steppers";
import {
  type AgentMessaging,
  type AnswerResult,
  type AttachmentRead,
  addresseesFit,
  type ChannelResult,
  type Conversation,
  type InboxAnswer,
  type InboxItem,
  type Message,
  type MessageSendOptions,
  type MessagingAgent,
  type MessagingId,
  type MessagingRefusal,
  type MessagingSource,
  type OutgoingAttachment,
  type SearchHit,
  type SendResult,
  type WorkItem,
} from "@halonicjs/ports";
import { checkedOrigin } from "./address.ts";
import { readAvatar } from "./avatars.ts";
import { boardRequestOf } from "./board-requests.ts";
import { ChangeFeed } from "./changes.ts";
import { PaperclipChannelMembers } from "./channel-members.ts";
import { PaperclipChannelSender } from "./channel-send.ts";
import { PaperclipChannelWork } from "./channel-work.ts";
import { readChannel, toChannel } from "./channels.ts";
import { readWorkingChats, withAgentWorking, withReadAt } from "./chat-signals.ts";
import { PaperclipCommentThreads } from "./comment-threads.ts";
import { PaperclipFullAnswers } from "./full-answers.ts";
import { PaperclipIds } from "./ids.ts";
import { PaperclipInbox } from "./inbox.ts";
import { asRecords, type JsonRecord, text } from "./json.ts";
import { type MapContext, newestFirst, toAgent, toConversation, toMessage, toWork } from "./map.ts";
import { PaperclipReader } from "./reader.ts";
import { isSafeSegment } from "./requests.ts";
import { searchAll } from "./search.ts";
import { type PaperclipUser, SignedInUser } from "./signed-in-user.ts";
import { PaperclipSteppers } from "./steppers.ts";
import {
  bodyOf,
  PaperclipClientError,
  PaperclipTransport,
  type TransportOptions,
} from "./transport.ts";
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
  /** The user the host named. Channel membership keeps to it; reading it from Paperclip there is HAL-18736's follow-up. */
  readonly #namedUserId: string | undefined;
  readonly #reader: PaperclipReader;
  readonly #inbox: PaperclipInbox;
  readonly #writer: PaperclipWriter;
  readonly #channels: PaperclipChannelSender;
  readonly #members: PaperclipChannelMembers;
  readonly #channelWork: PaperclipChannelWork;
  readonly #fullAnswers: PaperclipFullAnswers;
  readonly #threads: PaperclipCommentThreads;
  readonly #feed = new ChangeFeed<MessagingId>();
  #agentNames = new Map<string, string>();
  /** Each chat task's agent, as the chats were last read, for its messages' `readAt`. */
  #chatAgents = new Map<string, string>();
  /** The Inbox as last read, which search matches without reading every task's cards again. */
  #lastInbox: readonly InboxItem[] = [];
  #lastSeen: string | undefined;

  constructor(options: PaperclipMessagingOptions) {
    const now = options.now ?? (() => new Date());
    this.#ids = new PaperclipIds(options.connection);
    this.#company = options.company;
    this.#label = options.label;
    this.#origin = checkedOrigin(options.address);
    this.#reader = new PaperclipReader(new PaperclipTransport(options), now);
    this.#user = new SignedInUser(this.#reader, options.userId);
    this.#namedUserId = options.userId;
    const steppers =
      options.stepperCatalog && new PaperclipSteppers(this.#reader, options.stepperCatalog);
    const webLinks = new PaperclipWebLinks(options.address);
    this.#inbox = new PaperclipInbox(this.#reader, options.company, webLinks, steppers);
    this.#writer = new PaperclipWriter(this.#reader, this.#company, now, steppers);
    this.#channels = new PaperclipChannelSender(this.#reader, options.company, options.userId, now);
    this.#members = new PaperclipChannelMembers(this.#reader, options.company, options.userId);
    this.#channelWork = new PaperclipChannelWork(this.#reader, options.company, options.userId);
    this.#fullAnswers = new PaperclipFullAnswers(this.#reader, options.warn);
    this.#threads = new PaperclipCommentThreads(this.#reader);
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
    return this.#conversationsFrom(await this.#inbox.openTasks());
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
    // A chat not yet listed has no known agent, so its messages wait for the next read for `readAt`.
    const agent = this.#chatAgents.get(task);
    return agent === undefined
      ? answered
      : withReadAt(this.#reader, this.#ids, { task, agent }, answered);
  }

  async listInboxItems(): Promise<readonly InboxItem[]> {
    return this.#inboxFrom(undefined);
  }

  async listWork(): Promise<readonly WorkItem[]> {
    return this.#workFrom(await this.#inbox.openTasks());
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
   * Reads an agent's picture (`ports.agent-messaging-avatars`). This provider lists no files on
   * messages or cards yet, so any other ID is refused with `not-found` before any request.
   */
  async readAttachment(attachment: MessagingId): Promise<AttachmentRead> {
    const [avatar] = this.#ids.read(attachment, "avatar") ?? [];
    return avatar === undefined
      ? { outcome: "refused", reason: "not-found" }
      : readAvatar(this.#reader, avatar);
  }

  async send(
    conversation: MessagingId,
    body: string,
    attachments: readonly OutgoingAttachment[] = [],
    options: MessageSendOptions = {},
  ): Promise<SendResult> {
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
    const notAChat = await this.#refusalUnlessChat(task, options.to ?? []);
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
    const channels = this.#members.browse(this.#context(), await this.#inbox.openTasks());
    return newestFirst(channels, (conversation) => conversation.updatedAt);
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
   */
  async refresh(): Promise<void> {
    // One read of the open tasks serves both the Inbox and the work list.
    const tasks = await this.#inbox.openTasks();
    const seen = JSON.stringify([
      await this.#inboxFrom(tasks),
      await this.#conversationsFrom(tasks),
      this.#workFrom(tasks),
    ]);
    const changed = this.#lastSeen !== undefined && seen !== this.#lastSeen;
    this.#lastSeen = seen;
    if (changed) {
      this.#feed.push(this.#ids.source());
    }
  }

  /**
   * Revokes the key in Paperclip (`POST /api/cli-auth/revoke-current`), as
   * Disconnect does. Answers whether Paperclip revoked it: offline, signed
   * out or refused, it didn't, and the key stays valid until its expiry.
   */
  async revoke(): Promise<boolean> {
    const answer = await this.#reader.send("revokeKey");
    return answer.kind === "ok";
  }

  /** Reads who the key belongs to (`GET /api/cli-auth/me`); see {@link SignedInUser.read}. */
  signedInUser(): Promise<PaperclipUser | undefined> {
    return this.#user.read();
  }

  #changedAfter(wrote: boolean): void {
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

  /** The person's chats and the channels among `tasks`, newest first. */
  async #conversationsFrom(tasks: readonly JsonRecord[]): Promise<Conversation[]> {
    const context = this.#context();
    // A channel the person left shows in Browse instead.
    const channels = tasks.flatMap((record) => {
      const userId = this.#namedUserId;
      const channel = readChannel(record, userId);
      const left = userId !== undefined && !channel?.people.includes(userId);
      return channel === undefined || left ? [] : [toChannel(context, channel)];
    });
    const answer = await this.#reader.send("listChats", { path: { company: this.#company } });
    // Paperclip answers 404 when Agent Chat is off: there are no chats, which isn't an error.
    const records =
      answer.kind === "failed" && answer.failure === "not-found"
        ? []
        : asRecords(bodyOf("listChats", answer));
    this.#chatAgents = new Map(
      records.flatMap((record) => {
        const [task, agent] = [text(record, "id"), text(record, "conversationAgentId")];
        return task === undefined || agent === undefined ? [] : [[task, agent] as const];
      }),
    );
    // Live runs are read only when there are chats to mark (`paperclip-client.agent-working`).
    const working =
      records.length === 0 ? undefined : await readWorkingChats(this.#reader, this.#company);
    const chats = records.flatMap((record) => {
      const chat = toConversation(context, record);
      return chat === undefined ? [] : [withAgentWorking(this.#ids, chat, working)];
    });
    return newestFirst([...chats, ...channels], (conversation) => conversation.updatedAt);
  }

  /**
   * Why `task` can't take a message: offline, signed out, not one of the person's chats, or a `to`
   * naming an agent other than the chat's one agent.
   */
  async #refusalUnlessChat(
    task: string,
    to: readonly MessagingId[],
  ): Promise<MessagingRefusal | undefined> {
    const answer = await this.#reader.send("listChats", { path: { company: this.#company } });
    if (answer.kind === "failed") {
      const { failure } = answer;
      if (failure === "offline" || failure === "signed-out" || failure === "not-found") {
        return failure;
      }
    }
    const chats = asRecords(bodyOf("listChats", answer));
    const chat = chats.find((each) => text(each, "id") === task);
    if (chat === undefined) return "not-found";
    if (to.length === 0) return undefined;
    const conversation = toConversation(this.#context(), chat);
    return conversation !== undefined && addresseesFit(conversation, to) ? undefined : "not-found";
  }

  async #inboxFrom(tasks: readonly JsonRecord[] | undefined): Promise<InboxItem[]> {
    await this.#knowAgents();
    const items = await this.#inbox.list(this.#context(), tasks);
    this.#lastInbox = items;
    return items;
  }

  #workFrom(tasks: readonly JsonRecord[]): WorkItem[] {
    const context = this.#context();
    const work = tasks.flatMap((record) => toWork(context, record) ?? []);
    return newestFirst(work, (item) => item.updatedAt);
  }

  async #knowAgents(): Promise<void> {
    if (this.#agentNames.size === 0) {
      await this.listAgents();
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
