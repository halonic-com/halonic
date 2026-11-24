/** Version of the {@link PaperclipSource} port. A breaking change bumps it and comes with an ADR. */
export const paperclipSourceVersion = 1;

/**
 * Names one Paperclip item across every connection: the connection's name in
 * the workspace, the Paperclip company and the item's Paperclip ID. Task keys
 * such as `HAL-10` repeat across instances, so an item is never looked up by
 * its key alone (ADR 2026-11-24, Paperclip connection).
 */
export interface PaperclipItemId {
  /** The connection's name, from `connections/paperclip/<name>.yaml`. */
  connection: string;
  /** The Paperclip company the item belongs to. */
  company: string;
  /** The item's own ID in Paperclip. */
  id: string;
}

/** What an agent is doing, as Studio shows it. Paperclip states it doesn't know read as `other`. */
export type PaperclipAgentStatus = "idle" | "working" | "waiting" | "paused" | "other";

/** A Paperclip agent, shown as a read-only proxy item that runs nothing locally. */
export interface PaperclipAgent {
  ref: PaperclipItemId;
  name: string;
  /** Its role, such as "CTO", when Paperclip has one. */
  title?: string;
  status: PaperclipAgentStatus;
}

/** A Paperclip project, shown as a read-only proxy item. */
export interface PaperclipProject {
  ref: PaperclipItemId;
  name: string;
}

/** A Paperclip task, shown as a read-only proxy item. */
export interface PaperclipTask {
  ref: PaperclipItemId;
  /** The key people use, such as `HAL-10`. Shown, never used to look the task up. */
  key: string;
  title: string;
  /** Paperclip's own status text, such as `in_progress`. */
  status: string;
  assignee?: PaperclipItemId;
  project?: PaperclipItemId;
  /**
   * Set when the task is the board's chat with this agent: Messenger shows it
   * as that agent's conversation, and only such a task takes `commentOnChat`.
   */
  chatWith?: PaperclipItemId;
  /** When it last changed, as ISO text. */
  updatedAt: string;
}

/** Who wrote a comment or answered a card. */
export type PaperclipAuthor =
  | { kind: "agent"; agent: PaperclipItemId; name: string }
  | { kind: "board"; name: string };

/** A comment on a task. Comments are only ever added, so they never conflict. */
export interface PaperclipComment {
  ref: PaperclipItemId;
  task: PaperclipItemId;
  author: PaperclipAuthor;
  /** Markdown, as Paperclip stores it. */
  body: string;
  createdAt: string;
}

/** One answer a card offers. */
export interface PaperclipCardOption {
  id: string;
  label: string;
}

/** Whether a card still waits for the board, and if not, who answered it and how. */
export type PaperclipCardState =
  | { kind: "open" }
  | { kind: "answered"; by: PaperclipAuthor; answer: PaperclipCardAnswer; answeredAt: string };

/** A card: a question an agent put to the board on a task. */
export interface PaperclipCard {
  ref: PaperclipItemId;
  task: PaperclipItemId;
  /** The agent that asked. */
  from: PaperclipAuthor;
  question: string;
  options: readonly PaperclipCardOption[];
  createdAt: string;
  state: PaperclipCardState;
}

/** The board's answer to a card: one of its options, or a written reply. */
export type PaperclipCardAnswer =
  | { kind: "option"; option: string; note?: string }
  | { kind: "reply"; text: string };

/**
 * Why a source refused a write before sending it. `offline`: Paperclip can't
 * be reached, and nothing is queued to send later. `not-found`: the item isn't
 * in this source, including an item of another connection or company.
 * `not-a-chat`: the task isn't a chat task.
 */
export type PaperclipRefusal = "offline" | "not-found" | "not-a-chat";

/** What answering a card did. A card is answered once; Paperclip decides who was first. */
export type PaperclipAnswerResult =
  | { outcome: "answered"; answeredAt: string }
  | { outcome: "already-answered"; by: PaperclipAuthor; answeredAt: string }
  | { outcome: "refused"; reason: PaperclipRefusal };

/** What commenting on a chat task did. */
export type PaperclipCommentResult =
  | { outcome: "sent"; comment: PaperclipComment }
  | { outcome: "refused"; reason: PaperclipRefusal };

/**
 * What a read gives: the items, and how fresh they are. Offline, a source
 * gives its cache with `offline: true` and the time it was last read, so
 * Studio can show "Offline, as of 14:02".
 */
export interface PaperclipRead<Item> {
  items: readonly Item[];
  /** When Paperclip last gave these items, as ISO text. */
  asOf: string;
  offline: boolean;
}

/**
 * One Paperclip connection, as Studio's Inbox and Messenger read it
 * (requirement `ports.paperclip-source`). Paperclip stays the only source of
 * truth: a source reads it live and may keep a cache in the app data folder,
 * never inside a workspace.
 *
 * These seven calls are the whole list. A source makes no other call to
 * Paperclip, even though the board's key could: no hiring, budgets, settings
 * or deleting. A new call needs a new port version and a security review.
 *
 * A source belongs to one connection, so one server and one company. An item
 * of another connection or company is `not-found`, and every item it gives
 * carries its own connection and company. Writes are sent at once or refused:
 * offline, a write is refused with `offline` and never queued.
 *
 * @example
 * const cards = await source.listCards();
 * const open = cards.items.filter((card) => card.state.kind === "open");
 */
export interface PaperclipSource {
  /** The connection's name in the workspace. */
  readonly connection: string;
  /** The company this connection reads. */
  readonly company: string;
  listAgents(): Promise<PaperclipRead<PaperclipAgent>>;
  listProjects(): Promise<PaperclipRead<PaperclipProject>>;
  /** Tasks, newest change first. */
  listTasks(): Promise<PaperclipRead<PaperclipTask>>;
  /** A task's comments, oldest first. */
  listComments(task: PaperclipItemId): Promise<PaperclipRead<PaperclipComment>>;
  /** Cards, open and answered, newest first. */
  listCards(): Promise<PaperclipRead<PaperclipCard>>;
  /** Answers a card as the board. */
  answerCard(card: PaperclipItemId, answer: PaperclipCardAnswer): Promise<PaperclipAnswerResult>;
  /** Posts a comment as the board on a task whose `chatWith` is set. */
  commentOnChat(task: PaperclipItemId, body: string): Promise<PaperclipCommentResult>;
}
