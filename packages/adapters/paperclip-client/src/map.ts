import type {
  AgentActivity,
  Conversation,
  Message,
  MessagingAgent,
  MessagingAuthor,
  WorkItem,
  WorkState,
} from "@halonicjs/ports";
import { avatarPathOf } from "./avatars.ts";
import { withFullLinks } from "./full-links.ts";
import type { PaperclipIds } from "./ids.ts";
import { type JsonRecord, text } from "./json.ts";

/** What the mappers need besides the record itself. */
export interface MapContext {
  ids: PaperclipIds;
  /** Agent names by Paperclip agent ID, from the last agent list. */
  agentNames: ReadonlyMap<string, string>;
  /** The Paperclip user the key belongs to, when the engine knows it. */
  userId?: string;
  /** The connection's Paperclip origin, which links from its root get; without it they stay as written. */
  origin?: string;
  /**
   * When this read started. An answer or end Paperclip gives no time for happened by then, so its
   * time falls back to this rather than to the item's creation.
   */
  readAt?: string;
}

/** `markdown` with its links from the root of Paperclip made full addresses, when the origin is known. */
export function fullLinksOf(context: MapContext, markdown: string): string {
  return context.origin === undefined ? markdown : withFullLinks(markdown, context.origin);
}

const activities: Readonly<Record<string, AgentActivity>> = {
  idle: "idle",
  active: "idle",
  running: "working",
  paused: "paused",
  pending_approval: "waiting",
};

const workStates: Readonly<Record<string, WorkState>> = {
  backlog: "todo",
  todo: "todo",
  in_progress: "in-progress",
  in_review: "in-review",
  blocked: "blocked",
  done: "done",
  cancelled: "cancelled",
};

/** A record's time field as ISO text; the epoch when it is missing, so the item sorts last. */
export function timeOf(record: JsonRecord, name: string): string {
  return text(record, name) ?? new Date(0).toISOString();
}

/** The author of something Paperclip records with an agent ID or a user ID. */
export function authorOf(
  context: MapContext,
  agentId: string | undefined,
  userId: string | undefined,
): MessagingAuthor {
  if (agentId !== undefined) {
    return {
      kind: "agent",
      agent: context.ids.make("agent", agentId),
      name: context.agentNames.get(agentId) ?? "Agent",
    };
  }
  if (userId !== undefined && userId === context.userId) {
    return { kind: "me" };
  }
  // Paperclip lists user IDs only; a person's name would need a route the client doesn't call.
  return { kind: "person", name: "Board" };
}

/** A Paperclip agent, or `undefined` when it has no ID or name. */
export function toAgent(context: MapContext, record: JsonRecord): MessagingAgent | undefined {
  const id = text(record, "id");
  const name = text(record, "name");
  if (id === undefined || name === undefined) {
    return undefined;
  }
  const title = text(record, "title");
  const avatar = avatarPathOf(text(record, "avatarUrl"));
  return {
    id: context.ids.make("agent", id),
    source: context.ids.source(),
    name,
    ...(title === undefined ? {} : { title }),
    activity: activities[text(record, "status") ?? ""] ?? "other",
    ...(avatar === undefined ? {} : { avatar: context.ids.make("avatar", avatar) }),
  };
}

/** A Paperclip task as work, or `undefined` when it has no ID. */
export function toWork(context: MapContext, record: JsonRecord): WorkItem | undefined {
  const id = text(record, "id");
  if (id === undefined) {
    return undefined;
  }
  const assignee = text(record, "assigneeAgentId");
  return {
    id: context.ids.make("task", id),
    source: context.ids.source(),
    label: text(record, "identifier") ?? "",
    title: text(record, "title") ?? "",
    state: workStates[text(record, "status") ?? ""] ?? "other",
    ...(assignee === undefined ? {} : { assignee: context.ids.make("agent", assignee) }),
    // The task list carries no blockers; reading them is one request per task, left for later.
    blockedBy: [],
    updatedAt: timeOf(record, "updatedAt"),
  };
}

/** A Paperclip chat task as a conversation, or `undefined` when it isn't one. */
export function toConversation(context: MapContext, record: JsonRecord): Conversation | undefined {
  const id = text(record, "id");
  const agent = text(record, "conversationAgentId");
  if (id === undefined || agent === undefined) {
    return undefined;
  }
  return {
    id: context.ids.make("chat", id),
    source: context.ids.source(),
    agent: context.ids.make("agent", agent),
    title: text(record, "title") ?? "",
    updatedAt: timeOf(record, "updatedAt"),
    // Paperclip marks a chat "waiting" when the agent has answered and the person is next.
    waitingForMe: text(record, "conversationState") === "waiting",
  };
}

/**
 * A comment on chat task `task` as a message, or `undefined` when it was deleted or has no ID. An
 * agent's comment with a `fastResponseRequestId` is the receipt Paperclip's fast response posted in
 * the agent's name, so it is `automatic` (`paperclip-client.automatic-notes`).
 */
export function toMessage(
  context: MapContext,
  task: string,
  record: JsonRecord,
): Message | undefined {
  const id = text(record, "id");
  if (id === undefined || text(record, "deletedAt") !== undefined) {
    return undefined;
  }
  const agentId = text(record, "authorAgentId");
  const message: Message = {
    id: context.ids.make("comment", task, id),
    conversation: context.ids.make("chat", task),
    author: authorOf(context, agentId, text(record, "authorUserId")),
    body: fullLinksOf(context, text(record, "body") ?? ""),
    sentAt: timeOf(record, "createdAt"),
    attachments: [],
  };
  const receipt = agentId !== undefined && text(record, "fastResponseRequestId") !== undefined;
  return receipt ? { ...message, automatic: true } : message;
}

/** `items` newest first by `key`. ISO times sort as text. */
export function newestFirst<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((left, right) => key(right).localeCompare(key(left)));
}
