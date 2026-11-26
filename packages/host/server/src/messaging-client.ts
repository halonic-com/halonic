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
  MessagingRefusal,
  MessagingSource,
  MessagingSourceState,
  OutgoingAttachment,
  SearchHit,
  SendResult,
  WorkItem,
} from "@halonicjs/ports";
import { type Infer, parse, type Schema, s } from "@halonicjs/schema-kit";
import { decodeBase64url, encodeBase64url } from "@halonicjs/std";
import {
  type AccessToken,
  type ServerAnswer,
  ServerClientError,
  ServerConnection,
  type ServerFetch,
} from "./messaging-client-transport.ts";

const itemsAnswer = s.object({ items: s.array(s.unknown()) }).strict();
const resultAnswer = s.object({ result: s.object({ outcome: s.string() }).passthrough() }).strict();
const readAnswer = s
  .object({ outcome: s.literal("read"), type: s.string(), base64url: s.string() })
  .strict();
const changeData = s.object({ source: s.string() }).strict();

/** The wait before `changes` is opened again; it doubles after each stream that heard nothing. */
const firstReopenDelayMs = 1000;
const longestReopenDelayMs = 60_000;

/** Where the server is and how this device signs in to it. */
export interface ServerAgentMessagingOptions {
  /** The server's origin: `https`, or plain `http` to this computer only. */
  readonly address: string;
  /** The device's session token, from pairing. It goes only in the `Authorization` header. */
  readonly token: string;
  /** The Cloudflare Access service token for the server's origin, when an Access check fronts it. */
  readonly access?: AccessToken;
  /** The server's name for its stand-in source, until the server has listed its own sources. */
  readonly label: string;
  /** The `fetch` to use; the platform's own by default. */
  readonly fetch?: ServerFetch;
  readonly now?: () => Date;
  /** Waits before `changes` is opened again; a platform timer by default, a fake clock in tests. */
  readonly wait?: (milliseconds: number) => Promise<void>;
}

/**
 * The desktop's `AgentMessaging` when the workspace's messaging engine is a
 * server (HAL-17512 `server-engine`, S3): every call goes to that server's
 * `/api/messaging/*` routes, which run the providers and hold their keys.
 * The desktop holds only its device token. The hub joins this in place of
 * the local Paperclip provider, and the cache wraps it as before.
 *
 * A 401 makes the server's sources `signed-out`, and no answer makes them
 * `offline`, so the cache shows what it kept (`server.messaging-client`).
 *
 * @example
 * const messaging = new ServerAgentMessaging({ address: "https://halonic.acme.example", token, label: "Acme server" });
 * const sources = await messaging.listSources();
 */
export class ServerAgentMessaging implements AgentMessaging {
  readonly #connection: ServerConnection;
  readonly #label: string;
  readonly #now: () => Date;
  readonly #wait: (milliseconds: number) => Promise<void>;
  /** The sources the server listed last, so a signed-out or offline server still names them. */
  #known: readonly MessagingSource[] | undefined;

  constructor(options: ServerAgentMessagingOptions) {
    this.#connection = new ServerConnection(
      options.address,
      options.token,
      options.fetch ?? ((request) => fetch(request)),
      options.access,
    );
    this.#label = options.label;
    this.#now = options.now ?? (() => new Date());
    this.#wait =
      options.wait ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async listSources(): Promise<readonly MessagingSource[]> {
    const answer = await this.#connection.send("GET", "sources");
    if (answer.kind === "ok") {
      this.#known = (await items(answer, "sources")) as MessagingSource[];
      return this.#known;
    }
    if (answer.reason === "signed-out") return this.#knownAs(() => ({ kind: "signed-out" }));
    if (answer.reason === "offline") {
      // Offline as of the last answer the server gave about each source.
      const now = this.#now().toISOString();
      return this.#knownAs((state) => ({
        kind: "offline",
        asOf: state.kind === "signed-out" ? now : state.asOf,
      }));
    }
    throw refused("sources", answer.reason);
  }

  listAgents = () => this.#list<MessagingAgent>("GET", "agents");
  listConversations = () => this.#list<Conversation>("GET", "conversations");
  listInboxItems = () => this.#list<InboxItem>("GET", "inbox-items");
  listWork = () => this.#list<WorkItem>("GET", "work");
  browseChannels = () => this.#list<Conversation>("GET", "channels");
  listMessages = (conversation: MessagingId) =>
    this.#list<Message>("POST", "messages", { conversation });
  search = (text: string) => this.#list<SearchHit>("POST", "search", { text });

  answer(item: MessagingId, answer: InboxAnswer): Promise<AnswerResult> {
    return this.#result("answer", { item, answer });
  }

  async readAttachment(attachment: MessagingId): Promise<AttachmentRead> {
    const answer = await this.#connection.send("POST", "attachment", { attachment });
    if (answer.kind === "refused") return { outcome: "refused", reason: answer.reason };
    const read = parse(readAnswer, (await json(answer, "attachment", resultAnswer)).result);
    const bytes = read.ok ? decodeBase64url(read.value.base64url) : undefined;
    if (!read.ok || bytes === undefined) throw badAnswer("attachment");
    return { outcome: "read", type: read.value.type, bytes };
  }

  send(
    conversation: MessagingId,
    body: string,
    attachments: readonly OutgoingAttachment[] = [],
    options: MessageSendOptions = {},
  ): Promise<SendResult> {
    const files = attachments.map(({ name, type, bytes }) => ({
      name,
      type,
      base64url: encodeBase64url(bytes),
    }));
    return this.#result("send", {
      conversation,
      body,
      ...(files.length > 0 && { attachments: files }),
      ...(options.to !== undefined && { to: options.to }),
    });
  }

  startChannel(title: string, members: readonly MessagingId[], lead: MessagingId) {
    return this.#result<ChannelResult>("start-channel", { title, members, lead });
  }

  setMembers(channel: MessagingId, members: readonly MessagingId[], lead: MessagingId) {
    return this.#result<ChannelResult>("set-members", { channel, members, lead });
  }

  joinChannel(channel: MessagingId) {
    return this.#result<ChannelResult>("join-channel", { channel });
  }

  leaveChannel(channel: MessagingId) {
    return this.#result<ChannelResult>("leave-channel", { channel });
  }

  /**
   * Reads the server's `changes` event stream: each `change` message names a source. The
   * server ends its stream when its own feed fails, an offline server answers nothing, and a
   * reverse proxy answers 5xx while the server restarts, so the stream is opened again after a
   * wait: 1 s, doubling up to 60 s, and 1 s again after a stream that named a change
   * (`server.messaging-client-changes`). It ends only when the reader stops, or throws when
   * the server refuses for any reason but `offline`.
   */
  async *changes(): AsyncGenerator<MessagingId> {
    let delay = firstReopenDelayMs;
    for (;;) {
      const heard = yield* this.#oneChangesStream();
      if (heard) delay = firstReopenDelayMs;
      await this.#wait(delay);
      delay = Math.min(delay * 2, longestReopenDelayMs);
    }
  }

  /** Opens `changes` once and reads it to its end; says whether it named any change. */
  async *#oneChangesStream(): AsyncGenerator<MessagingId, boolean> {
    const answer = await this.#connection.send("GET", "changes");
    if (answer.kind === "refused" && answer.reason === "offline") return false;
    if (answer.kind === "refused") throw refused("changes", answer.reason);
    const reader = answer.response.body?.getReader();
    if (reader === undefined) return false;
    const decoder = new TextDecoder();
    let buffered = "";
    let heard = false;
    try {
      for (;;) {
        const read = await reader.read().catch(() => undefined);
        // A connection that drops mid-stream ends it the same way the server ending it does.
        if (read === undefined || read.done) return heard;
        buffered += decoder.decode(read.value, { stream: true });
        const frames = buffered.split("\n\n");
        buffered = frames.pop() ?? "";
        for (const frame of frames) {
          const source = changedSource(frame);
          if (source === undefined) continue;
          heard = true;
          yield source;
        }
      }
    } finally {
      // A dropped stream refuses to be cancelled; it is closed already.
      await reader.cancel().catch(() => undefined);
    }
  }

  /** The sources last listed with `state` in place of theirs, or the server's stand-in source. */
  #knownAs(state: (was: MessagingSourceState) => MessagingSourceState): MessagingSource[] {
    const known = this.#known ?? [
      {
        id: `halonic-server:${this.#connection.origin}`,
        provider: "halonic",
        label: this.#label,
        state: { kind: "signed-out" },
      },
    ];
    return known.map((source) => ({ ...source, state: state(source.state) }));
  }

  /** A list read; a refusal throws, so the cache can show what it kept. */
  async #list<Item>(method: "GET" | "POST", call: string, body?: unknown): Promise<Item[]> {
    const answer = await this.#connection.send(method, call, body);
    if (answer.kind === "refused") throw refused(call, answer.reason);
    return (await items(answer, call)) as Item[];
  }

  /** A write: the server's `{ result }`, or the port's refusal it answered. */
  async #result<Result>(call: string, body: unknown): Promise<Result> {
    const answer = await this.#connection.send("POST", call, body);
    if (answer.kind === "refused") return { outcome: "refused", reason: answer.reason } as Result;
    return (await json(answer, call, resultAnswer)).result as Result;
  }
}

async function items(answer: Extract<ServerAnswer, { kind: "ok" }>, call: string) {
  return (await json(answer, call, itemsAnswer)).items;
}

/** A good answer's JSON, checked against `schema`; anything else throws without quoting it. */
async function json<S extends Schema>(
  answer: Extract<ServerAnswer, { kind: "ok" }>,
  call: string,
  schema: S,
): Promise<Infer<S>> {
  let value: unknown;
  try {
    value = await answer.response.json();
  } catch {
    throw badAnswer(call);
  }
  const parsed = parse(schema, value);
  if (!parsed.ok) throw badAnswer(call);
  return parsed.value;
}

/** The source a `change` frame names, or nothing for any other frame. */
function changedSource(frame: string): MessagingId | undefined {
  const lines = frame.split("\n");
  const data = lines.find((line) => line.startsWith("data: "));
  if (!lines.includes("event: change") || data === undefined) return undefined;
  try {
    const parsed = parse(changeData, JSON.parse(data.slice("data: ".length)));
    return parsed.ok ? parsed.value.source : undefined;
  } catch {
    return undefined;
  }
}

function refused(call: string, reason: MessagingRefusal): ServerClientError {
  return new ServerClientError(`The server refused ${call}: ${reason}.`, reason);
}

function badAnswer(call: string): ServerClientError {
  return new ServerClientError(`The server's answer to ${call} can't be read.`, "bad-answer");
}
