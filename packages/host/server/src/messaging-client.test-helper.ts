import type {
  AgentMessaging,
  AnswerResult,
  AttachmentRead,
  ChannelResult,
  Conversation,
  Coordination,
  InboxAnswer,
  InboxItem,
  Message,
  MessageSendOptions,
  MessagingAgent,
  MessagingId,
  MessagingRefusal,
  MessagingSource,
  OutgoingAttachment,
  SearchHit,
  SendResult,
  WorkItem,
} from "@halonicjs/ports";
import { decodeBase64url, encodeBase64url } from "@halonicjs/std";
import type { RequestLogEntry, Server } from "./api.ts";
import { messagingPathPrefix } from "./messaging-routes.ts";
import { messagingRefusals } from "./messaging-wire.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

/**
 * An `AgentMessaging` over the server's messaging routes, in the process, so
 * the port's contract runs against the routes. It sends `headers` (the
 * session) with every request. A refusal comes back as its error code and
 * turns into the port's refusal again; any other error throws.
 */
export class RouteAgentMessaging implements AgentMessaging {
  readonly #server: Server;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(server: Server, headers: Readonly<Record<string, string>>) {
    this.#server = server;
    this.#headers = headers;
  }

  listSources = () => this.#list<MessagingSource>("sources");
  listAgents = () => this.#list<MessagingAgent>("agents");
  listConversations = () => this.#list<Conversation>("conversations");
  listInboxItems = () => this.#list<InboxItem>("inbox-items");
  listWork = () => this.#list<WorkItem>("work");
  browseChannels = () => this.#list<Conversation>("channels");

  listMessages = (conversation: MessagingId) =>
    this.#list<Message>("messages", "POST", { conversation });
  search = (text: string) => this.#list<SearchHit>("search", "POST", { text });

  answer(item: MessagingId, answer: InboxAnswer): Promise<AnswerResult> {
    return this.#result("answer", { item, answer });
  }

  async readAttachment(attachment: MessagingId): Promise<AttachmentRead> {
    const read = await this.#result<
      | { outcome: "read"; type: string; base64url: string }
      | Extract<AttachmentRead, { outcome: "refused" }>
    >("attachment", { attachment });
    if (read.outcome === "refused") return read;
    return {
      outcome: "read",
      type: read.type,
      bytes: decodeBase64url(read.base64url) ?? new Uint8Array(),
    };
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

  startChannel(
    title: string,
    members: readonly MessagingId[],
    lead: MessagingId,
  ): Promise<ChannelResult> {
    return this.#result("start-channel", { title, members, lead });
  }

  setMembers(
    channel: MessagingId,
    members: readonly MessagingId[],
    lead: MessagingId,
  ): Promise<ChannelResult> {
    return this.#result("set-members", { channel, members, lead });
  }

  joinChannel(channel: MessagingId): Promise<ChannelResult> {
    return this.#result("join-channel", { channel });
  }

  leaveChannel(channel: MessagingId): Promise<ChannelResult> {
    return this.#result("leave-channel", { channel });
  }

  /** Reads the `changes` event stream: each `change` message names a source. */
  async *changes(): AsyncGenerator<MessagingId> {
    const answer = await this.#send("GET", "changes");
    const reader = answer.body?.getReader();
    if (reader === undefined) return;
    const decoder = new TextDecoder();
    let buffered = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffered += decoder.decode(value, { stream: true });
        const frames = buffered.split("\n\n");
        buffered = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame.split("\n").find((line) => line.startsWith("data: "));
          if (data !== undefined)
            yield (JSON.parse(data.slice(6)) as { source: MessagingId }).source;
        }
      }
    } finally {
      await reader.cancel();
    }
  }

  async #list<Item>(call: string, method = "GET", body?: unknown): Promise<readonly Item[]> {
    const answer = await this.#send(method, call, body);
    return ((await answer.json()) as { items: Item[] }).items;
  }

  /** A write or a read with a result: a refusal's error code becomes the port's refusal. */
  async #result<Result>(call: string, body: unknown): Promise<Result> {
    const answer = await this.#send("POST", call, body);
    const json = (await answer.json()) as { result?: Result; code?: string };
    if (answer.ok) return json.result as Result;
    return { outcome: "refused", reason: json.code as MessagingRefusal } as Result;
  }

  async #send(method: string, call: string, body?: unknown): Promise<Response> {
    const answer = await this.#server.handle(
      new Request(`http://localhost${messagingPathPrefix}${call}`, {
        method,
        headers: { host: "localhost", "content-type": "application/json", ...this.#headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    if (answer.ok) return answer;
    const { code } = (await answer.clone().json()) as { code: string };
    if ((messagingRefusals as readonly string[]).includes(code)) return answer;
    throw new Error(`${method} ${call} answered ${answer.status} ${code}`);
  }
}

/** A server for one owner, with `port` behind its messaging routes; with `password: false` it has none. */
export function messagingServer(port: AgentMessaging, options: { password?: boolean } = {}) {
  const clock = new TestClock();
  const focus: boolean[] = [];
  const requestLog: RequestLogEntry[] = [];
  const errors: unknown[] = [];
  const server = testServer({
    passwordHash: options.password === false ? null : "hash:pw",
    clock,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    messaging: { port, focus: { report: (inFront) => focus.push(inFront) } },
    requestLog: { record: (entry) => requestLog.push(entry) },
    errorLog: { record: (cause) => errors.push(cause) },
    config: { allowedHosts: ["localhost"], maxBodyBytes: 64 * 1024 },
  });
  return { server, clock, focus, requestLog, errors };
}

/** Signs in with the password and gives the headers that carry the session. */
export async function signedIn(server: Server): Promise<Record<string, string>> {
  const response = await server.handle(
    new Request("http://localhost/api/login", {
      method: "POST",
      headers: { host: "localhost", "content-type": "application/json" },
      body: JSON.stringify({ password: "pw" }),
    }),
  );
  return { cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

/** One request to a messaging route, from loopback. */
export function callMessaging(
  server: Server,
  method: string,
  call: string,
  options: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<Response> {
  return server.handle(
    new Request(`http://localhost${messagingPathPrefix}${call}`, {
      method,
      headers: { host: "localhost", "content-type": "application/json", ...options.headers },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    }),
  );
}

/** The error code a refused request answered. */
export async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { code: string }).code;
}
