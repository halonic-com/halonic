import type { ActionResultAnswer, InboxActionRequest } from "./agent-messaging-actions.ts";
import type { ChannelResult, MessageSendOptions, MessageWork } from "./agent-messaging-channels.ts";
import type { InboxStepperRequest } from "./agent-messaging-steppers.ts";

/**
 * Version of the {@link AgentMessaging} port. A breaking change bumps it and comes with an ADR.
 * Version 2 adds attachments, `readAttachment` and files sent with a message. Version 3 adds action
 * items and the `action-result` answer (ADR 2026-11-24, AgentMessaging version 3). Version 4 adds
 * channels: conversations with several agents (ADR 2026-11-24, agent messaging, "Version 4").
 */
export const agentMessagingVersion = 4;

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
  /**
   * Its picture, when the source has one: an ID for {@link AgentMessaging.readAttachment}, never
   * an address. Apps show the agent's initial while it is missing or can't be read
   * (requirement `ports.agent-messaging-avatars`).
   */
  avatar?: MessagingId;
}

/**
 * A file an agent put on a message or an inbox item, such as a screenshot. It holds no address:
 * an app reads its bytes only through {@link AgentMessaging.readAttachment}, so the engine makes
 * the call and an app never gets a provider's URL (requirement `ports.agent-messaging-attachments`).
 * Its name and type come from the agent, so apps show them as text and trust neither.
 */
export interface Attachment {
  id: MessagingId;
  /** The file's name as the agent gave it, such as "login.png". */
  name: string;
  /** Its media type as the source gave it, such as "image/png". */
  type: string;
  /** Its size in bytes. */
  size: number;
}

/**
 * A file the person sends with a message. Its name and type are the person's; the engine checks
 * its size and type itself and refuses with `too-large` or `unsupported-type`, whatever a screen
 * already checked.
 */
export interface OutgoingAttachment {
  name: string;
  type: string;
  bytes: Uint8Array;
}

/** What reading an attachment's bytes gave. Offline, the cache may not hold them, so the read is refused. */
export type AttachmentRead =
  | { outcome: "read"; bytes: Uint8Array; type: string }
  | { outcome: "refused"; reason: MessagingRefusal };

/** Who wrote a message or answered an inbox item. `me` is the person using Studio. */
export type MessagingAuthor =
  | { kind: "me" }
  | { kind: "agent"; agent: MessagingId; name: string }
  | { kind: "person"; name: string };

/** One conversation: the person and one agent, or in a channel the person and several agents. */
export interface Conversation {
  id: MessagingId;
  source: MessagingId;
  /** For a direct conversation, the agent. For a channel, its lead: the agent who answers when the person names no one. */
  agent: MessagingId;
  /** Only for a channel: every agent in it, the lead included, 2 to 8 agents of one source. */
  members?: readonly MessagingId[];
  title: string;
  /** When the last message came, as ISO text. Lists are newest first by this. */
  updatedAt: string;
  /** Whether the agent's last message waits for the person's reply. */
  waitingForMe: boolean;
  /**
   * Whether the conversation's own agent ({@link Conversation.agent}) has a started run on the
   * conversation's work right now, so apps can show it typing. Another agent's run on the same
   * work, or a run that is only queued, doesn't count. Absent when the source can't tell.
   */
  agentWorking?: boolean;
}

/**
 * A message in a conversation. `body` is Markdown written by an agent, so by
 * whoever can steer one: apps render it with no raw HTML, no scripts and no
 * `javascript:` links, open links outside the app, load no image on their
 * own, and never treat it as a Halonic command.
 *
 * `author` always comes from the source: a message the person sent is `me`,
 * and no app can say who wrote a message.
 */
export interface Message {
  id: MessagingId;
  conversation: MessagingId;
  author: MessagingAuthor;
  body: string;
  /** Files sent with it, in the order they were added; often none. */
  attachments: readonly Attachment[];
  sentAt: string;
  /** Who the person addressed, from {@link MessageSendOptions.to}. */
  to?: readonly MessagingId[];
  /** One line per agent the person's message went to. */
  work?: readonly MessageWork[];
  /**
   * Only on the person's own messages: when the conversation's agent first picked it up, as ISO
   * text. That is the start of the agent's first run on the conversation's work that either names
   * this message among the ones that woke it (for Paperclip, `wakeCommentIds`) or started after the
   * message was sent. A queued run that hasn't started doesn't count. Absent while unread, or when
   * the source can't tell.
   */
  readAt?: string;
}

/** One answer an inbox item offers. */
export interface InboxItemOption {
  id: string;
  label: string;
}

/**
 * The person's answer to an inbox item: one of its options or a written reply
 * to a question, or for an action item the result of the stepper the person
 * ran, which only Studio's stepper sends.
 */
export type InboxAnswer =
  | { kind: "option"; option: string; note?: string }
  | { kind: "reply"; text: string }
  | ActionResultAnswer;

/** Whether an inbox item still waits, and if not, who answered it and how. */
export type InboxItemState =
  | { kind: "open" }
  | { kind: "answered"; by: MessagingAuthor; answer: InboxAnswer; answeredAt: string };

/** A project in a source, such as a Paperclip project. Apps filter the Inbox by it. */
export interface MessagingProject {
  id: MessagingId;
  name: string;
}

/**
 * A card or a question an agent put to the person. `question` is agent-written Markdown, as {@link Message}'s body.
 *
 * An item with `action` or `stepper` is an action item: a request that the person run a
 * user-only action stepper (ADR 2026-11-24, action sender). It offers no
 * options, `question` is the requester's reason, and it takes only an
 * `action-result` answer. Any other item takes only an option or a reply.
 */
export interface InboxItem {
  id: MessagingId;
  source: MessagingId;
  from: MessagingAuthor;
  question: string;
  options: readonly InboxItemOption[];
  /** For an action item, the request: a reviewed definition and its parameters, never a call. */
  action?: InboxActionRequest;
  /**
   * For an action item from a stored request, the stepper request at the
   * revision its source pinned; set instead of `action`, never with it.
   */
  stepper?: InboxStepperRequest;
  /** The project it belongs to (for Paperclip, its task's project). Without one, apps show it under "No project". */
  project?: MessagingProject;
  /** Files the agent put on it, such as a screenshot, in the order they were added; often none. */
  attachments: readonly Attachment[];
  /** The work it belongs to, when the source has one. */
  work?: MessagingId;
  /**
   * The conversation it was asked in, when the source knows one, so an app can open
   * that chat from the card. Absent when the item came from no conversation.
   */
  conversation?: MessagingId;
  /** Set by the provider only: `risky` is an approval that spends money or changes who may do what. Absent reads as `normal`. */
  risk?: "normal" | "risky";
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

/**
 * Why a write or a read was refused before it was sent. Offline, nothing is queued to send later.
 * `too-large` and `unsupported-type` refuse a file sent with a message, whole: nothing of it is sent.
 * `bad-answer`: the answer doesn't fit the item: an option or a reply to an action item, an
 * `action-result` to any other, or an `action-result` that fails its allow-list.
 * `bad-members`: the agents don't make a channel (`channelMembersFit`).
 * `not-supported`: the source has no channels.
 */
export type MessagingRefusal =
  | "offline"
  | "signed-out"
  | "not-found"
  | "too-large"
  | "unsupported-type"
  | "bad-answer"
  | "bad-members"
  | "not-supported";

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
  /** Answers an item once, or refuses with `bad-answer` an answer that doesn't fit it (`answerFitsItem`). */
  answer(item: MessagingId, answer: InboxAnswer): Promise<AnswerResult>;
  /**
   * An attachment's bytes, read through the engine only when the person asks to see it: apps
   * load nothing on their own and never get the provider's address for it. The one exception is
   * an agent's {@link MessagingAgent.avatar}, the picture the source's own people set for it on
   * the connection's own host, which apps read on their own to show next to its name.
   */
  readAttachment(attachment: MessagingId): Promise<AttachmentRead>;
  /**
   * Sends as the person, with files when given, to the agents in `options.to` or else the lead.
   * The engine refuses a file it won't take, and then sends nothing. A `to` naming anyone outside
   * the conversation is refused with `not-found`.
   */
  send(
    conversation: MessagingId,
    body: string,
    attachments?: readonly OutgoingAttachment[],
    options?: MessageSendOptions,
  ): Promise<SendResult>;
  /** Starts a channel with these agents, `lead` among them (`channelMembersFit`). Only the person does this. */
  startChannel(
    title: string,
    members: readonly MessagingId[],
    lead: MessagingId,
  ): Promise<ChannelResult>;
  /** Sets a channel's members. A new member sees the channel's history, so the app says so first. */
  setMembers(
    channel: MessagingId,
    members: readonly MessagingId[],
    lead: MessagingId,
  ): Promise<ChannelResult>;
  /** Channels in the sources that the person isn't in. */
  browseChannels(): Promise<readonly Conversation[]>;
  /** The person joins a channel. Agents are members only through `setMembers`. */
  joinChannel(channel: MessagingId): Promise<ChannelResult>;
  /** The person leaves a channel; it shows in `browseChannels` again. */
  leaveChannel(channel: MessagingId): Promise<ChannelResult>;
  /** The ID of each source that changed, as it changes. Ends when the reader stops. */
  changes(): AsyncIterable<MessagingId>;
}
