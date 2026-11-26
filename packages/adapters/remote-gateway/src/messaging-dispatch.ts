import type {
  AnswerResult,
  GatewayMessagingClientMessage,
  gatewayRefusalCodes,
  InboxItem,
  MessagingId,
  PhoneMessaging,
  SendResult,
} from "@halonicjs/ports";
import { fitPage, type GatewayPage } from "./fit-page.ts";
import type { GatewayPolicy } from "./session-source.ts";

/** What a paired phone may spend on calls that cost the board a Paperclip request each. */
export type GatewayRateLimited = "search" | "send";

/**
 * One paired phone's rate for searches and sends (Julian, HAL-17540). The
 * host keys it by the paired phone, not by the connection, so a reconnect
 * doesn't refill it.
 */
export interface GatewayRateLimit {
  /** Whether the phone may make one more `kind` call now; counts the call when it may. */
  take(kind: GatewayRateLimited): boolean;
}

/** What the gateway serves the Inbox, Messenger and team status from, for one phone. */
export interface GatewayMessaging {
  /** The host's allow-list view: the gateway reads nothing else. */
  readonly view: PhoneMessaging;
  readonly rateLimit: GatewayRateLimit;
}

type RefusalCode = (typeof gatewayRefusalCodes)[number];
type MessagingType = GatewayMessagingClientMessage["type"];
type MessageOf<Type extends MessagingType> = Extract<GatewayMessagingClientMessage, { type: Type }>;

/** How a handler answers the phone; the connection writes and closes. */
export interface MessagingReplies {
  /** Sends one message, already made to fit, as JSON. */
  send(json: string): void;
  refuse(replyTo: string, code: RefusalCode): void;
  /** Closes the connection with `malformed`. */
  malformed(): void;
  /** Closes the connection without a word, as when a page can't be made to fit. */
  close(): void;
}

/** What a handler serves a message with: one phone's view, the desktop's switch and the connection. */
export interface MessagingContext {
  readonly messaging: GatewayMessaging;
  readonly policy: GatewayPolicy;
  readonly replies: MessagingReplies;
  /** The connection's one `msg-watch`. */
  readonly watch: MessagingWatch;
}

type Context = MessagingContext;

type Handler<Type extends MessagingType> = (
  context: Context,
  message: MessageOf<Type>,
) => Promise<void>;

/** The port refusals the phone gets as an `error`; the others stay in the `msg-result`. */
const portRefusals = new Set<string>(["offline", "signed-out", "not-found", "not-supported"]);

/**
 * The dispatcher table: each version 4 message type and the one handler that
 * serves it from {@link PhoneMessaging} (requirement
 * `remote-gateway.messaging-allow-list`). A type the parser doesn't know is
 * `malformed` before it gets here, and a type this table doesn't list can't be
 * dispatched: the gateway has no other road to the host's ports.
 */
const handlers: { readonly [Type in MessagingType]: Handler<Type> } = Object.freeze({
  "msg-read": readMessaging,
  "msg-search": search,
  "msg-answer": answer,
  "msg-send": send,
  "msg-watch": watch,
  "msg-unwatch": unwatch,
  "team-read": readTeam,
});

/** Serves one version 4 message from the phone through the table; a port that fails rejects. */
export function dispatchMessaging(
  context: Context,
  message: GatewayMessagingClientMessage,
): Promise<void> {
  const handler = handlers[message.type] as Handler<MessagingType>;
  return handler(context, message);
}

async function readMessaging(context: Context, message: MessageOf<"msg-read">): Promise<void> {
  const { view } = context.messaging;
  if (message.what === "messages") {
    // Only a conversation the view lists, as `msg-send` checks it.
    const conversations = await view.listConversations();
    if (!conversations.some((candidate) => candidate.id === message.conversation)) {
      return context.replies.refuse(message.id, "not-found");
    }
    // Oldest first from the port; the phone reads the newest page first.
    const messages = [...(await view.listMessages(message.conversation))].reverse();
    return sendPage(
      context,
      { type: "msg-data", replyTo: message.id, what: "messages", items: [] },
      messages,
      message.before,
    );
  }
  const lists = {
    sources: () => view.listSources(),
    agents: () => view.listAgents(),
    conversations: () => view.listConversations(),
    inbox: () => view.listInboxItems(),
    work: () => view.listWork(),
  };
  const items = await lists[message.what]();
  return sendPage(
    context,
    { type: "msg-data", replyTo: message.id, what: message.what, items: [] },
    items,
    message.cursor,
  );
}

async function search(context: Context, message: MessageOf<"msg-search">): Promise<void> {
  if (!context.messaging.rateLimit.take("search")) {
    return context.replies.refuse(message.id, "rate-limited");
  }
  const hits = await context.messaging.view.search(message.text);
  return sendPage(
    context,
    { type: "msg-data", replyTo: message.id, what: "hits", items: [] },
    hits,
    undefined,
  );
}

/**
 * Answers an inbox item. Its risk and its source's state are read again here,
 * from the provider, never from what the phone sent; an offline source is
 * refused before `answer`, so nothing can wait in an outbox.
 */
async function answer(context: Context, message: MessageOf<"msg-answer">): Promise<void> {
  const { view } = context.messaging;
  const items = await inboxOrLineDown(view);
  if (typeof items === "string") return context.replies.refuse(message.id, items);
  const item = items.find((candidate) => candidate.id === message.item);
  if (item === undefined) return context.replies.refuse(message.id, "not-found");
  // Fails closed: any risk but `normal` (absent reads as `normal`) waits for the switch.
  const risky = item.risk !== undefined && item.risk !== "normal";
  if (risky && !context.policy.allowRiskyRemotely()) {
    return context.replies.refuse(message.id, "not-allowed-remotely");
  }
  const source = (await view.listSources()).find((candidate) => candidate.id === item.source);
  if (source === undefined) return context.replies.refuse(message.id, "not-found");
  if (source.state.kind !== "online") return context.replies.refuse(message.id, source.state.kind);
  return sendResult(context, message.id, await view.answer(item.id, message.answer));
}

/**
 * The Inbox, or why the line is down. A provider's read fails while it is
 * offline, so a failed read is refused with the sources' state when none is
 * online (HAL-19053); with one online, the failure stands.
 */
async function inboxOrLineDown(
  view: PhoneMessaging,
): Promise<readonly InboxItem[] | "offline" | "signed-out"> {
  try {
    return await view.listInboxItems();
  } catch (error) {
    const kinds = (await view.listSources()).map((source) => source.state.kind);
    if (kinds.includes("online")) throw error;
    if (kinds.includes("offline")) return "offline";
    if (kinds.includes("signed-out")) return "signed-out";
    throw error;
  }
}

/**
 * Sends a message to an existing conversation. The host checks `to` itself
 * before anything reaches the provider, and passes no attachments: the phone
 * has none to send.
 */
async function send(context: Context, message: MessageOf<"msg-send">): Promise<void> {
  const { view, rateLimit } = context.messaging;
  const conversations = await view.listConversations();
  const conversation = conversations.find((candidate) => candidate.id === message.conversation);
  if (conversation === undefined) return context.replies.refuse(message.id, "not-found");
  const members = conversation.members ?? [conversation.agent];
  const to = message.to ?? [];
  if (!to.every((agent) => members.includes(agent))) {
    return context.replies.refuse(message.id, "not-allowed-from-phone");
  }
  if (!rateLimit.take("send")) return context.replies.refuse(message.id, "rate-limited");
  const options = to.length > 0 ? { to } : undefined;
  return sendResult(
    context,
    message.id,
    await view.send(conversation.id, message.body, undefined, options),
  );
}

async function watch(context: Context, message: MessageOf<"msg-watch">): Promise<void> {
  const { replies } = context;
  const push = (source: MessagingId) =>
    replies.send(JSON.stringify({ type: "msg-changed", source }));
  context.watch.start(context.messaging.view, push, () => replies.close());
  replies.send(JSON.stringify({ type: "ok", replyTo: message.id }));
}

async function unwatch(context: Context, message: MessageOf<"msg-unwatch">): Promise<void> {
  context.watch.stop();
  context.replies.send(JSON.stringify({ type: "ok", replyTo: message.id }));
}

async function readTeam(context: Context, message: MessageOf<"team-read">): Promise<void> {
  const { team } = context.messaging.view;
  const page = { type: "team-data", replyTo: message.id, what: message.what, items: [] } as const;
  if (message.what === "pull-request") {
    const detail = await team.pullRequest(message.pullRequest);
    if (detail === undefined) return context.replies.refuse(message.id, "not-found");
    return sendPage(context, page, [detail], undefined);
  }
  const lists = {
    parts: () => team.parts(),
    spend: () => team.spend(message.what === "spend" ? (message.range ?? "today") : "today"),
    seats: () => team.seats(),
    "pull-requests": () => team.pullRequests(),
    queue: () => team.mergeQueue(),
  };
  return sendPage(context, page, await lists[message.what](), undefined);
}

/** A port refusal the protocol has a code for goes out as that `error`; any other result as `msg-result`. */
function sendResult(context: Context, replyTo: string, result: AnswerResult | SendResult): void {
  if (result.outcome === "refused" && portRefusals.has(result.reason)) {
    context.replies.refuse(replyTo, result.reason as RefusalCode);
  } else {
    context.replies.send(JSON.stringify({ type: "msg-result", replyTo, result }));
  }
}

/**
 * Sends the page of `items` that starts at `cursor`, as much of it as fits.
 * A cursor is the index the host made for the phone to hand back; one the
 * host couldn't have made is `malformed`. A first item that alone can't fit
 * closes the connection rather than skip it.
 */
function sendPage(
  context: Context,
  page: GatewayPage,
  items: readonly unknown[],
  cursor: string | undefined,
): void {
  const start = startOf(cursor, items.length);
  if (start === undefined) {
    context.replies.malformed();
    return;
  }
  const json = fitPage({ ...page, items: items.slice(start) }, (leftOut) =>
    String(start + leftOut),
  );
  // Only a page with items can fail to fit.
  if (json === undefined) context.replies.close();
  else context.replies.send(json);
}

function startOf(cursor: string | undefined, length: number): number | undefined {
  if (cursor === undefined) return 0;
  if (!/^\d{1,9}$/.test(cursor)) return undefined;
  const start = Number(cursor);
  return start <= length ? start : undefined;
}

/**
 * The phone's `msg-watch`: a `msg-changed` push for each source that changes,
 * from both ports, until `msg-unwatch` or the connection closes.
 */
export class MessagingWatch {
  private readers: AsyncIterator<MessagingId>[] = [];

  /** Starts watching, or keeps the watch there is; `push` sends each change. */
  start(view: PhoneMessaging, push: (source: MessagingId) => void, onError: () => void): void {
    if (this.readers.length > 0) return;
    for (const changes of [view.changes(), view.team.changes()]) {
      const reader = changes[Symbol.asyncIterator]();
      this.readers.push(reader);
      void this.pump(reader, push).catch(onError);
    }
  }

  /** Stops every reader; a later change is never pushed. */
  stop(): void {
    const readers = this.readers;
    this.readers = [];
    // A reader that fails while it stops has nothing left to report.
    for (const reader of readers) void reader.return?.().catch(() => undefined);
  }

  private async pump(reader: AsyncIterator<MessagingId>, push: (source: MessagingId) => void) {
    for (;;) {
      const next = await reader.next();
      if (next.done === true || !this.readers.includes(reader)) return;
      push(next.value);
    }
  }
}
