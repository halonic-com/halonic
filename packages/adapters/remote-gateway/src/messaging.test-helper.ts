import type {
  AgentMessaging,
  Conversation,
  InboxItem,
  Message,
  MessagingId,
  MessagingSource,
  PhoneMessaging,
  SendResult,
  TeamStatus,
} from "@halonicjs/ports";
import type { GatewayMessaging, GatewayRateLimited } from "./messaging-dispatch.ts";

/** Every member of both ports, the ones the phone may never reach included. */
export const allPortMembers = [
  "listSources",
  "listAgents",
  "listConversations",
  "listMessages",
  "listInboxItems",
  "listWork",
  "search",
  "answer",
  "readAttachment",
  "send",
  "startChannel",
  "setMembers",
  "browseChannels",
  "joinChannel",
  "leaveChannel",
  "changes",
  "parts",
  "spend",
  "agentSpend",
  "seats",
  "pullRequests",
  "pullRequest",
  "mergeQueue",
  "agent",
  "runs",
] as const satisfies readonly (keyof AgentMessaging | keyof TeamStatus)[];

const at = "2026-11-25T08:00:00Z";

/** A source of the acme company, online unless a test says otherwise. */
export const acmeSource: MessagingSource = {
  id: "src-acme",
  provider: "paperclip",
  label: "Paperclip · Acme",
  state: { kind: "online", asOf: at },
};

/** A channel with two agents, the first its lead. */
export const channel: Conversation = {
  id: "conv-1",
  source: acmeSource.id,
  agent: "agent-ada",
  members: ["agent-ada", "agent-bo"],
  title: "Launch",
  updatedAt: at,
  waitingForMe: false,
};

/** An open inbox item; `risk` is the provider's to set. */
export function inboxItem(risk?: "normal" | "risky"): InboxItem {
  return {
    id: "item-1",
    source: acmeSource.id,
    from: { kind: "agent", agent: "agent-ada", name: "Ada" },
    question: "Ship it?",
    options: [{ id: "yes", label: "Yes" }],
    attachments: [],
    createdAt: at,
    state: { kind: "open" },
    ...(risk === undefined ? {} : { risk }),
  } as InboxItem;
}

function message(index: number): Message {
  return {
    id: `msg-${index}`,
    conversation: channel.id,
    author: { kind: "agent", agent: "agent-ada", name: "Ada" },
    body: `Message ${index}`,
    attachments: [],
    sentAt: at,
  } as unknown as Message;
}

/**
 * A fake of the host's view that records every member called. It also has
 * the members the phone may never reach, as a host's hub would, so a test
 * can show the gateway never calls them even though they are there.
 */
export class FakePhoneMessaging {
  readonly calls: string[] = [];
  readonly sent: unknown[][] = [];
  source: MessagingSource = acmeSource;
  item: InboxItem = inboxItem();
  /** What `listInboxItems` fails with, as a provider's read does offline; unset, it answers. */
  inboxFailure: Error | undefined;
  messages: Message[] = [1, 2, 3].map(message);
  sendResult: SendResult = { outcome: "sent", message: message(4) };
  /** What `limit` allows of each kind before it refuses. */
  readonly left: Record<GatewayRateLimited, number> = {
    search: 10,
    send: 10,
    reactions: 30,
  };
  private readonly changed: ((source: MessagingId) => void)[] = [];

  /** The view as the gateway gets it, every member recorded. */
  view(): PhoneMessaging {
    const record = <Value>(name: string, value: Value) => {
      this.calls.push(name);
      return Promise.resolve(value);
    };
    const all: Record<(typeof allPortMembers)[number], unknown> = {
      listSources: () => record("listSources", [this.source]),
      listAgents: () => record("listAgents", []),
      listConversations: () => record("listConversations", [channel]),
      listMessages: () => record("listMessages", this.messages),
      listInboxItems: () =>
        this.inboxFailure === undefined
          ? record("listInboxItems", [this.item])
          : Promise.reject(this.inboxFailure),
      listWork: () => record("listWork", []),
      search: () => record("search", []),
      answer: () => record("answer", { outcome: "answered", answeredAt: at }),
      send: (...args: unknown[]) => {
        this.sent.push(args);
        return record("send", this.sendResult);
      },
      changes: () => this.changesOf("changes"),
      readAttachment: () => record("readAttachment", undefined),
      startChannel: () => record("startChannel", undefined),
      setMembers: () => record("setMembers", undefined),
      browseChannels: () => record("browseChannels", []),
      joinChannel: () => record("joinChannel", undefined),
      leaveChannel: () => record("leaveChannel", undefined),
      parts: () => record("parts", []),
      spend: () => record("spend", []),
      agentSpend: () => record("agentSpend", []),
      seats: () => record("seats", []),
      pullRequests: () => record("pullRequests", []),
      pullRequest: (id: string) => record("pullRequest", id === "pr-1" ? { id } : undefined),
      mergeQueue: () => record("mergeQueue", []),
      agent: () => record("agent", undefined),
      runs: () => record("runs", []),
    };
    // The host hands a hub with more than the view on it; only the type keeps them off.
    return { ...all, team: all } as unknown as PhoneMessaging;
  }

  /** The view and a rate that counts down {@link left}. */
  gateway(): GatewayMessaging {
    return {
      view: this.view(),
      rateLimit: {
        take: (kind) => {
          if (this.left[kind] === 0) return false;
          this.left[kind]--;
          return true;
        },
      },
    };
  }

  /** Tells every reader of `changes` that `source` changed. */
  change(source: MessagingId): void {
    for (const listener of this.changed) listener(source);
  }

  private async *changesOf(name: string): AsyncGenerator<MessagingId> {
    this.calls.push(name);
    const waiting: MessagingId[] = [];
    let wake: () => void = () => undefined;
    this.changed.push((source) => {
      waiting.push(source);
      wake();
    });
    for (;;) {
      const next = waiting.shift();
      if (next !== undefined) yield next;
      else await new Promise<void>((resolve) => (wake = resolve));
    }
  }
}
