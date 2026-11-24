import type {
  AgentMessaging,
  AnswerResult,
  Conversation,
  InboxAnswer,
  InboxItem,
  Message,
  MessagingAgent,
  MessagingId,
  MessagingRefusal,
  MessagingSource,
  SearchHit,
  SendResult,
  WorkItem,
} from "@halonicjs/ports";
import { ChangeFeed } from "./changes.ts";
import { PaperclipIds } from "./ids.ts";
import { PaperclipInbox } from "./inbox.ts";
import { asRecords, type JsonRecord, text } from "./json.ts";
import { type MapContext, newestFirst, toAgent, toConversation, toMessage, toWork } from "./map.ts";
import { PaperclipReader } from "./reader.ts";
import { isSafeSegment } from "./requests.ts";
import { searchAll } from "./search.ts";
import {
  bodyOf,
  PaperclipClientError,
  PaperclipTransport,
  type TransportOptions,
} from "./transport.ts";
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
  now?: () => Date;
}

/** How many of a chat's newest messages are read. */
const messagePage = "100";

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
  readonly #userId: string | undefined;
  readonly #reader: PaperclipReader;
  readonly #inbox: PaperclipInbox;
  readonly #writer: PaperclipWriter;
  readonly #feed = new ChangeFeed<MessagingId>();
  #agentNames = new Map<string, string>();
  #lastSeen: string | undefined;

  constructor(options: PaperclipMessagingOptions) {
    const now = options.now ?? (() => new Date());
    this.#ids = new PaperclipIds(options.connection);
    this.#company = options.company;
    this.#label = options.label;
    this.#userId = options.userId;
    this.#reader = new PaperclipReader(new PaperclipTransport(options), now);
    this.#inbox = new PaperclipInbox(this.#reader, options.company);
    this.#writer = new PaperclipWriter(this.#reader, now);
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

  async listConversations(): Promise<readonly Conversation[]> {
    const answer = await this.#reader.send("listChats", { path: { company: this.#company } });
    // Paperclip answers 404 when Agent Chat is off: there are no chats, which isn't an error.
    if (answer.kind === "failed" && answer.failure === "not-found") {
      return [];
    }
    const context = this.#context();
    const chats = asRecords(bodyOf("listChats", answer)).flatMap(
      (record) => toConversation(context, record) ?? [],
    );
    return newestFirst(chats, (chat) => chat.updatedAt);
  }

  async listMessages(conversation: MessagingId): Promise<readonly Message[]> {
    const [task] = this.#ids.read(conversation, "chat") ?? [];
    if (task === undefined) {
      return [];
    }
    await this.#knowAgents();
    const body = await this.#reader.read("listComments", {
      path: { task },
      query: { order: "desc", limit: messagePage },
    });
    const context = this.#context();
    return asRecords(body)
      .flatMap((record) => toMessage(context, task, record) ?? [])
      .reverse();
  }

  async listInboxItems(): Promise<readonly InboxItem[]> {
    return this.#inboxFrom(undefined);
  }

  async listWork(): Promise<readonly WorkItem[]> {
    return this.#workFrom(await this.#inbox.openTasks());
  }

  async search(query: string): Promise<readonly SearchHit[]> {
    return searchAll(query, {
      agents: await this.listAgents(),
      conversations: await this.listConversations(),
      inbox: await this.listInboxItems(),
      work: await this.listWork(),
    });
  }

  async answer(item: MessagingId, answer: InboxAnswer): Promise<AnswerResult> {
    const target = {
      card: this.#ids.read(item, "card"),
      approval: this.#ids.read(item, "approval"),
    };
    const result = await this.#writer.answer(this.#context(), target, answer);
    this.#changedAfter(result.outcome !== "refused");
    return result;
  }

  async send(conversation: MessagingId, body: string): Promise<SendResult> {
    const [task] = this.#ids.read(conversation, "chat") ?? [];
    // An unsafe ID is refused before any request, the chat check's read included.
    if (task === undefined || !isSafeSegment(task)) {
      return { outcome: "refused", reason: "not-found" };
    }
    // The key may comment only on the person's own chats (ADR: "comment on a chat task"),
    // so a stale or made-up chat ID never turns into a comment on some other task.
    const notAChat = await this.#refusalUnlessChat(task);
    if (notAChat !== undefined) {
      return { outcome: "refused", reason: notAChat };
    }
    const sent = await this.#writer.send(task, body);
    if (sent.kind === "refused") {
      return { outcome: "refused", reason: sent.reason };
    }
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
      await this.listConversations(),
      this.#workFrom(tasks),
    ]);
    const changed = this.#lastSeen !== undefined && seen !== this.#lastSeen;
    this.#lastSeen = seen;
    if (changed) {
      this.#feed.push(this.#ids.source());
    }
  }

  #changedAfter(wrote: boolean): void {
    if (wrote) {
      this.#lastSeen = undefined;
      this.#feed.push(this.#ids.source());
    }
  }

  /** Why `task` can't take a message: offline, signed out, or not one of the person's chats. */
  async #refusalUnlessChat(task: string): Promise<MessagingRefusal | undefined> {
    const answer = await this.#reader.send("listChats", { path: { company: this.#company } });
    if (answer.kind === "failed") {
      const { failure } = answer;
      if (failure === "offline" || failure === "signed-out" || failure === "not-found") {
        return failure;
      }
    }
    const chats = asRecords(bodyOf("listChats", answer));
    return chats.some((chat) => text(chat, "id") === task) ? undefined : "not-found";
  }

  async #inboxFrom(tasks: readonly JsonRecord[] | undefined): Promise<InboxItem[]> {
    await this.#knowAgents();
    return this.#inbox.list(this.#context(), tasks);
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
      ...(this.#userId === undefined ? {} : { userId: this.#userId }),
    };
  }
}
