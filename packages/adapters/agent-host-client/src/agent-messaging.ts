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
  OutgoingAttachment,
  SearchHit,
  SendResult,
  WorkItem,
} from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
import { decodeBase64url } from "@halonicjs/std";
import { AgentHostError, type AgentHostTransport, readAnswer } from "./transport.ts";

const itemsAnswer = s.object({ items: s.array(s.unknown()) }).strict();
const resultAnswer = s.object({ result: s.object({ outcome: s.string() }).passthrough() }).strict();
/** Every refusal the port names; the host answers with one of these and no other. */
const refusals = [
  "offline",
  "signed-out",
  "not-found",
  "too-large",
  "unsupported-type",
] as const satisfies readonly MessagingRefusal[];
const attachmentAnswer = s
  .object({
    result: s.union([
      s.object({ outcome: s.literal("read"), type: s.string(), base64url: s.string() }).strict(),
      s.object({ outcome: s.literal("refused"), reason: s.enum(refusals) }).strict(),
    ]),
  })
  .strict();
const changesAnswer = s
  .object({ next: s.number().int().min(0), sources: s.array(s.string()) })
  .strict();
const nothing = s.object({}).strict();

/** What an {@link AgentHostMessaging} reads for. */
type ListName = "sources" | "agents" | "conversations" | "messages" | "inbox" | "work" | "search";

/**
 * The desktop engine's `AgentMessaging`, for one workspace (ADR 2026-11-24,
 * agent messaging, deployment (a)): every call goes to the agent host, which
 * runs the providers, holds their keys and keeps the cache. Studio provides
 * it as `AgentMessagingService`, so no feature knows which engine it talks
 * to. The host is Halonic's own, so its lists are passed on as it sends them.
 *
 * `changes` asks the host which sources changed and the host holds the
 * call until one has, or about 25 seconds pass (a long poll): a call on this
 * computer, while the host polls Paperclip on its own schedule.
 *
 * @example
 * const messaging = new AgentHostMessaging(transport, "/work/acme");
 * const items = await messaging.listInboxItems();
 */
export class AgentHostMessaging implements AgentMessaging {
  readonly #transport: AgentHostTransport;
  readonly #workspace: string;

  constructor(transport: AgentHostTransport, workspace: string) {
    this.#transport = transport;
    this.#workspace = workspace;
  }

  listSources(): Promise<readonly MessagingSource[]> {
    return this.#read<MessagingSource>("sources");
  }

  listAgents(): Promise<readonly MessagingAgent[]> {
    return this.#read<MessagingAgent>("agents");
  }

  listConversations(): Promise<readonly Conversation[]> {
    return this.#read<Conversation>("conversations");
  }

  listMessages(conversation: MessagingId): Promise<readonly Message[]> {
    return this.#read<Message>("messages", { conversation });
  }

  listInboxItems(): Promise<readonly InboxItem[]> {
    return this.#read<InboxItem>("inbox");
  }

  listWork(): Promise<readonly WorkItem[]> {
    return this.#read<WorkItem>("work");
  }

  search(text: string): Promise<readonly SearchHit[]> {
    return this.#read<SearchHit>("search", { text });
  }

  async answer(item: MessagingId, answer: InboxAnswer): Promise<AnswerResult> {
    const route = "POST /v1/messaging/answer";
    const body = { workspace: this.#workspace, item, answer };
    const reply = await this.#transport.request(route, body);
    return readAnswer(route, reply, resultAnswer).result as AnswerResult;
  }

  /**
   * Sends to the conversation's lead. The host's route carries no `to` yet, so a message that
   * names agents is refused with `not-supported` rather than sent to the lead alone.
   */
  async send(
    conversation: MessagingId,
    body: string,
    _attachments?: readonly OutgoingAttachment[],
    options?: MessageSendOptions,
  ): Promise<SendResult> {
    if ((options?.to?.length ?? 0) > 0) return { outcome: "refused", reason: "not-supported" };
    const route = "POST /v1/messaging/send";
    const reply = await this.#transport.request(route, {
      workspace: this.#workspace,
      conversation,
      body,
    });
    return readAnswer(route, reply, resultAnswer).result as SendResult;
  }

  // The host's hub has no channels yet (AgentMessaging version 4): it lists none and refuses
  // every channel call, so these answer the same without asking it.

  startChannel(
    _title: string,
    _members: readonly MessagingId[],
    _lead: MessagingId,
  ): Promise<ChannelResult> {
    return noChannels();
  }

  setMembers(
    _channel: MessagingId,
    _members: readonly MessagingId[],
    _lead: MessagingId,
  ): Promise<ChannelResult> {
    return noChannels();
  }

  browseChannels(): Promise<readonly Conversation[]> {
    return Promise.resolve([]);
  }

  joinChannel(_channel: MessagingId): Promise<ChannelResult> {
    return noChannels();
  }

  leaveChannel(_channel: MessagingId): Promise<ChannelResult> {
    return noChannels();
  }

  /** An attachment's bytes, which the host reads from the source or its cache and sends as base64url. */
  async readAttachment(attachment: MessagingId): Promise<AttachmentRead> {
    const route = "POST /v1/messaging/attachment";
    const reply = await this.#transport.request(route, { workspace: this.#workspace, attachment });
    const { result } = readAnswer(route, reply, attachmentAnswer);
    if (result.outcome === "refused") return { outcome: "refused", reason: result.reason };
    return { outcome: "read", type: result.type, bytes: bytesOf(route, result.base64url) };
  }

  /**
   * The sources that change from now on. A host that can't be asked ends the
   * stream with its error, so the reader shows it rather than missing changes.
   */
  async *changes(): AsyncIterable<MessagingId> {
    let after = (await this.#changesSince(0, false)).next;
    for (;;) {
      const { next, sources } = await this.#changesSince(after, true);
      after = next;
      yield* sources;
    }
  }

  /** Tells the host whether Studio's window is in front, so it polls every 30 seconds or every 5 minutes. */
  async setInFront(inFront: boolean): Promise<void> {
    const route = "POST /v1/messaging/focus";
    readAnswer(route, await this.#transport.request(route, { inFront }), nothing);
  }

  /** The host's changes after `after`; with `wait`, it answers once one has, or after about 25 seconds. */
  async #changesSince(after: number, wait: boolean) {
    const route = "POST /v1/messaging/changes";
    const body = { workspace: this.#workspace, after, ...(wait ? { wait } : {}) };
    const answer = await this.#transport.request(route, body);
    return readAnswer(route, answer, changesAnswer);
  }

  async #read<Item>(
    list: ListName,
    extra: { conversation?: string; text?: string } = {},
  ): Promise<readonly Item[]> {
    const route = "POST /v1/messaging/read";
    const answer = await this.#transport.request(route, {
      workspace: this.#workspace,
      list,
      ...extra,
    });
    return readAnswer(route, answer, itemsAnswer).items as Item[];
  }
}

/** The bytes `base64url` stands for; an answer that isn't base64url is refused, not guessed at. */
function bytesOf(route: string, base64url: string): Uint8Array {
  const bytes = decodeBase64url(base64url);
  if (bytes === undefined) {
    throw new AgentHostError(
      200,
      "answer_invalid",
      `${route} answered bytes that aren't base64url.`,
    );
  }
  return bytes;
}

/** A channel call the host doesn't serve yet. */
function noChannels(): Promise<ChannelResult> {
  return Promise.resolve({ outcome: "refused", reason: "not-supported" });
}
