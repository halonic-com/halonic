import type {
  AgentActivity,
  AgentMessaging,
  AttachmentRead,
  AttachmentRefusal,
  Conversation,
  Message,
  MessagingAgent,
  MessagingId,
  MessagingRefusal,
  MessagingSource,
} from "@halonicjs/ports";
import { DraftFiles } from "./draft-files.ts";
import { QuickActions } from "./quick-actions.ts";
import { refusalOf } from "./refusal.ts";

export { refusalOf } from "./refusal.ts";

/** The Messenger's tabs: every conversation, or only those whose agent wrote last. */
export type MessengerTab = "all" | "waiting";

/**
 * One row of the Messenger's list. A conversation holds a list of agents,
 * though phase 1 has one per conversation: phase 2's channels put several
 * agents in one conversation without changing the row.
 */
export interface ConversationRow {
  readonly conversation: Conversation;
  readonly agents: readonly MessagingAgent[];
  /** The conversation's source, with its label and whether it is online; none once it is gone. */
  readonly source: MessagingSource | undefined;
}

/** What sending a conversation's draft did. A draft that wasn't sent stays as it was. */
export type DraftOutcome =
  | { readonly outcome: "sent"; readonly message: Message }
  | {
      readonly outcome: "kept";
      readonly reason: MessagingRefusal | AttachmentRefusal | "blank";
    };

/**
 * The Messenger of one open workspace (requirement `messenger.conversations`):
 * the conversations `AgentMessaging` gives, a draft per conversation, and
 * sending a draft. It holds no copy of the conversations; each read asks the
 * port again, so what it shows is what the source last had.
 *
 * @example
 * const messenger = new Messenger(messaging);
 * const rows = await messenger.rows("waiting");
 * messenger.setDraft(rows[0].conversation.id, "On it");
 * await messenger.sendDraft(rows[0].conversation.id);
 */
export class Messenger {
  /** The chats' quick actions: answering the agent's cards, and asking for an update. */
  readonly quickActions: QuickActions;
  /** The files waiting in each chat's box, sent with its next message. */
  readonly files = new DraftFiles();
  private readonly messaging: AgentMessaging;
  private readonly drafts = new Map<MessagingId, string>();

  constructor(messaging: AgentMessaging) {
    this.messaging = messaging;
    this.quickActions = new QuickActions(messaging);
  }

  /** The conversations of a tab, newest first, each with its agents and its source's label. */
  async rows(tab: MessengerTab = "all"): Promise<readonly ConversationRow[]> {
    const [sources, agents, conversations] = await Promise.all([
      this.messaging.listSources(),
      this.messaging.listAgents(),
      this.messaging.listConversations(),
    ]);
    const rows = [...conversations]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((conversation) => rowOf(conversation, sources, agents));
    return inTab(rows, tab);
  }

  /** A conversation's messages, oldest first, or only those whose text holds `search`. */
  async messages(conversation: MessagingId, search = ""): Promise<readonly Message[]> {
    const messages = await this.messaging.listMessages(conversation);
    return messages.filter((message) => holds(message.body, search));
  }

  /** What is typed in a conversation's box and not sent yet. */
  draft(conversation: MessagingId): string {
    return this.drafts.get(conversation) ?? "";
  }

  /** Keeps what is typed in a conversation's box, so it survives switching conversations. */
  setDraft(conversation: MessagingId, text: string): void {
    if (text === "") this.drafts.delete(conversation);
    else this.drafts.set(conversation, text);
  }

  /**
   * Sends a conversation's draft, with the files waiting in its box. Offline
   * or signed out, it asks the source nothing and keeps the draft and the
   * files: nothing is queued to send later (ADR, Offline). A refusal from the
   * source keeps them too; only a sent message clears them, and the draft only
   * while it still holds what was sent, so text typed during the send stays.
   */
  async sendDraft(conversation: MessagingId, row?: ConversationRow): Promise<DraftOutcome> {
    const body = this.draft(conversation);
    const files = this.files.of(conversation);
    if (body.trim() === "" && files.length === 0) return { outcome: "kept", reason: "blank" };
    const refusal = row === undefined ? undefined : refusalOf(row);
    if (refusal !== undefined) return { outcome: "kept", reason: refusal };
    const outgoing = await this.files.outgoing(conversation);
    const result =
      outgoing.length === 0
        ? await this.messaging.send(conversation, body)
        : await this.messaging.send(conversation, body, outgoing);
    if (result.outcome === "refused") return { outcome: "kept", reason: result.reason };
    if (this.draft(conversation) === body) this.drafts.delete(conversation);
    this.files.clear(conversation);
    return { outcome: "sent", message: result.message };
  }

  /** An attachment's bytes, read through the engine only when the person asks to see it. */
  readAttachment(attachment: MessagingId): Promise<AttachmentRead> {
    return this.messaging.readAttachment(attachment);
  }

  /**
   * Calls `listener` each time a source changes, until the returned function
   * is called. The Messenger reads again then; it never polls.
   */
  watch(listener: (source: MessagingId) => void): () => void {
    const changes = this.messaging.changes()[Symbol.asyncIterator]();
    let stopped = false;
    const next = (): void => {
      changes.next().then(
        (change) => {
          if (stopped || change.done === true) return;
          listener(change.value);
          next();
        },
        (error: unknown) => {
          // A broken change feed ends the watch; the page still reads on its own actions.
          if (!stopped) console.error("The Messenger stopped hearing changes:", error);
        },
      );
    };
    next();
    return () => {
      stopped = true;
      void changes.return?.();
    };
  }
}

/** The rows a tab lists: all of them, or only those whose agent wrote last. */
export function inTab(
  rows: readonly ConversationRow[],
  tab: MessengerTab,
): readonly ConversationRow[] {
  return tab === "waiting" ? rows.filter((row) => row.conversation.waitingForMe) : rows;
}

/** The activity a conversation shows: its agent's, or `other` when no agent is known. */
export function activityOf(row: ConversationRow): AgentActivity {
  return row.agents[0]?.activity ?? "other";
}

function rowOf(
  conversation: Conversation,
  sources: readonly MessagingSource[],
  agents: readonly MessagingAgent[],
): ConversationRow {
  return {
    conversation,
    agents: agents.filter((agent) => agent.id === conversation.agent),
    source: sources.find((each) => each.id === conversation.source),
  };
}

/** Whether `text` holds `search`, ignoring case; an empty search matches everything. */
function holds(text: string, search: string): boolean {
  const wanted = search.trim().toLowerCase();
  return wanted === "" || text.toLowerCase().includes(wanted);
}
