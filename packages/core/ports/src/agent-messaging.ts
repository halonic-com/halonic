/** Version of the {@link AgentMessaging} port. A breaking change bumps it and comes with an ADR. */
export const agentMessagingVersion = 1;

/**
 * An item's ID, opaque to apps: only the provider that made it reads it. It
 * holds the provider, the connection and the provider's own ID, so items of
 * two connections never collide, but an app only compares it and hands it
 * back. It is never a task key such as `HAL-10`, which repeats across
 * instances (ADR 2026-11-24, agent messaging).
 */
export type MessagingId = string;

/** Whether a source can be reached, and how fresh what it gave is. */
export type MessagingSourceState =
  | { kind: "online"; asOf: string }
  | { kind: "offline"; asOf: string }
  | { kind: "signed-out" };

/**
 * One connection a provider serves, such as one Paperclip instance and
 * company. Apps show its label next to every item from it.
 */
export interface MessagingSource {
  id: MessagingId;
  /** The provider's kind, for an icon: "paperclip", later "halonic" or others. Never parsed. */
  provider: string;
  /** What the user reads, such as "Paperclip · Halonic". */
  label: string;
  state: MessagingSourceState;
}

/** What an agent is doing, as apps show it. A state a provider can't map reads as `other`. */
export type AgentActivity = "idle" | "working" | "waiting" | "paused" | "other";

/** An agent a source knows. It runs nothing locally; the provider only reports it. */
export interface MessagingAgent {
  id: MessagingId;
  source: MessagingId;
  name: string;
  /** Its role, such as "CTO", when the source has one. */
  title?: string;
  activity: AgentActivity;
}

/** Who wrote a message or answered an inbox item. `me` is the person using Studio. */
export type MessagingAuthor =
  | { kind: "me" }
  | { kind: "agent"; agent: MessagingId; name: string }
  | { kind: "person"; name: string };

/** One conversation: the person and one agent. Phase 2 adds channels with several agents. */
export interface Conversation {
  id: MessagingId;
  source: MessagingId;
  agent: MessagingId;
  title: string;
  /** When the last message came, as ISO text. Lists are newest first by this. */
  updatedAt: string;
  /** Whether the agent's last message waits for the person's reply. */
  waitingForMe: boolean;
}

/**
 * A message in a conversation. `body` is Markdown written by an agent, so by
 * whoever can steer one: apps render it with no raw HTML, no scripts and no
 * `javascript:` links, open links outside the app, load no image on their
 * own, and never treat it as a Halonic command.
 */
export interface Message {
  id: MessagingId;
  conversation: MessagingId;
  author: MessagingAuthor;
  body: string;
  sentAt: string;
}

/** One answer an inbox item offers. */
export interface InboxItemOption {
  id: string;
  label: string;
}

/** The person's answer to an inbox item: one of its options, or a written reply. */
export type InboxAnswer =
  | { kind: "option"; option: string; note?: string }
  | { kind: "reply"; text: string };

/** Whether an inbox item still waits, and if not, who answered it and how. */
export type InboxItemState =
  | { kind: "open" }
  | { kind: "answered"; by: MessagingAuthor; answer: InboxAnswer; answeredAt: string };

/** A project in a source, such as a Paperclip project. Apps filter the Inbox by it. */
export interface MessagingProject {
  id: MessagingId;
  name: string;
}

/** A card or a question an agent put to the person. `question` is agent-written Markdown, as {@link Message}'s body. */
export interface InboxItem {
  id: MessagingId;
  source: MessagingId;
  from: MessagingAuthor;
  question: string;
  options: readonly InboxItemOption[];
  /** The project it belongs to (for Paperclip, its task's project). Without one, apps show it under "No project". */
  project?: MessagingProject;
  /** The work it belongs to, when the source has one. */
  work?: MessagingId;
  createdAt: string;
  state: InboxItemState;
}

/** Where a piece of work stands, as apps show it. A state a provider can't map reads as `other`. */
export type WorkState =
  | "todo"
  | "in-progress"
  | "in-review"
  | "blocked"
  | "done"
  | "cancelled"
  | "other";

/** A piece of work an agent holds, such as a Paperclip task, for the overview. */
export interface WorkItem {
  id: MessagingId;
  source: MessagingId;
  /** What people call it, such as `HAL-10`. Shown, never used to look it up. */
  label: string;
  title: string;
  state: WorkState;
  assignee?: MessagingId;
  blockedBy: readonly MessagingId[];
  updatedAt: string;
}

/** Why a write was refused before it was sent. Offline, nothing is queued to send later. */
export type MessagingRefusal = "offline" | "signed-out" | "not-found";

/** What answering an inbox item did. An item is answered once; the source decides who was first. */
export type AnswerResult =
  | { outcome: "answered"; answeredAt: string }
  | { outcome: "already-answered"; by: MessagingAuthor; answeredAt: string }
  | { outcome: "refused"; reason: MessagingRefusal };

/** What sending a message did. */
export type SendResult =
  | { outcome: "sent"; message: Message }
  | { outcome: "refused"; reason: MessagingRefusal };

/** One search result. */
export interface SearchHit {
  kind: "agent" | "conversation" | "message" | "inbox-item" | "work";
  id: MessagingId;
  source: MessagingId;
  title: string;
  /** A short piece of the text that matched. */
  excerpt: string;
}

/**
 * How Studio's apps (Inbox, Messenger, the overview) talk to agents,
 * whoever runs them (requirement `ports.agent-messaging`). Apps see only
 * this port: no provider's types, IDs or addresses. The engine serves it,
 * and each provider (Paperclip first) is one more source behind it; keys
 * and the calls a provider may make live only in that provider.
 *
 * The port is the same whether the engine runs on the desktop or on a
 * server: the workspace's environment chooses which, and no app knows.
 *
 * Reads give what the source last had. Offline, they give its cache, and
 * {@link MessagingSource.state} says as of when. Writes are sent at once or
 * refused, never queued. `changes` says which source changed, so apps read
 * again instead of polling.
 *
 * @example
 * const items = await messaging.listInboxItems();
 * const open = items.filter((item) => item.state.kind === "open");
 */
export interface AgentMessaging {
  listSources(): Promise<readonly MessagingSource[]>;
  listAgents(): Promise<readonly MessagingAgent[]>;
  /** Conversations, newest first. */
  listConversations(): Promise<readonly Conversation[]>;
  /** A conversation's messages, oldest first. */
  listMessages(conversation: MessagingId): Promise<readonly Message[]>;
  /** Inbox items, open and answered, newest first. */
  listInboxItems(): Promise<readonly InboxItem[]>;
  /** Work, newest change first. */
  listWork(): Promise<readonly WorkItem[]>;
  search(text: string): Promise<readonly SearchHit[]>;
  answer(item: MessagingId, answer: InboxAnswer): Promise<AnswerResult>;
  send(conversation: MessagingId, body: string): Promise<SendResult>;
  /** The ID of each source that changed, as it changes. Ends when the reader stops. */
  changes(): AsyncIterable<MessagingId>;
}
