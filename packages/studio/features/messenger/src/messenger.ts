import type {
  AgentActivity,
  AgentMessaging,
  AttachmentRead,
  Conversation,
  Message,
  MessagingAgent,
  MessagingId,
  MessagingRefusal,
  MessagingSource,
  SendResult,
} from "@halonicjs/ports";
import { ChannelAdmin } from "./channel-admin.ts";
import { type ChannelQuestion, channelQuestions } from "./channel-waiting.ts";
import { DraftFiles } from "./draft-files.ts";
import { isFromAgentOf, QuickActions } from "./quick-actions.ts";
import { refusalOf } from "./refusal.ts";

export { refusalOf } from "./refusal.ts";

/** The Messenger's tabs: every conversation, or only those whose agent wrote last. */
export type MessengerTab = "all" | "waiting";

/**
 * One row of the Messenger's list. A chat holds its one agent; a channel its
 * members, the lead first.
 */
export interface ConversationRow {
  readonly conversation: Conversation;
  readonly agents: readonly MessagingAgent[];
  /** Every agent its source lists, members or not: who wrote a message is looked up here. */
  readonly sourceAgents: readonly MessagingAgent[];
  /** The conversation's source, with its label and whether it is online; none once it is gone. */
  readonly source: MessagingSource | undefined;
  /** A channel's questions still waiting for the person, oldest first; none for a chat. */
  readonly questions?: readonly ChannelQuestion[];
  /** The newest message, for the row's preview and time; none in an empty chat. */
  readonly last?: Message;
  /** How many of the chat agent's cards are open, for the row's "1 card" chip. */
  readonly openCards?: number;
}

/** What sending a conversation's draft did. A draft that wasn't sent stays as it was. */
export type DraftOutcome =
  | { readonly outcome: "sent"; readonly message: Message }
  | {
      readonly outcome: "kept";
      readonly reason: MessagingRefusal | "blank";
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
  /** Starting, browsing, joining and leaving channels, and changing their members. */
  readonly channels: ChannelAdmin;
  /** The files waiting in each chat's box, sent with its next message. */
  readonly files = new DraftFiles();
  /** The time now, for how long an agent has been working on what the person asked. */
  readonly now: () => Date;
  private readonly messaging: AgentMessaging;
  private readonly drafts = new Map<MessagingId, string>();
  private readonly picks = new Map<MessagingId, readonly MessagingId[]>();
  /** When the newest message the person saw in each chat was sent, while this Messenger lives. */
  private readonly seen = new Map<MessagingId, string>();

  constructor(messaging: AgentMessaging, now: () => Date = () => new Date()) {
    this.messaging = messaging;
    this.now = now;
    this.quickActions = new QuickActions(messaging);
    this.channels = new ChannelAdmin(messaging);
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
    return inTab(await this.withFacts(rows), tab);
  }

  /**
   * Each row with its newest message and its open cards (`messenger.chat-rows`), and a channel's
   * with the questions it holds for the person.
   */
  private async withFacts(rows: readonly ConversationRow[]): Promise<readonly ConversationRow[]> {
    const items = await this.messaging.listInboxItems();
    return Promise.all(
      rows.map(async (row) => {
        const messages = await this.messaging.listMessages(row.conversation.id);
        const last = messages.at(-1);
        const facts = last === undefined ? row : { ...row, last };
        if (row.conversation.members !== undefined) {
          return { ...facts, questions: channelQuestions(row, messages, items) };
        }
        const open = items.filter((item) => item.state.kind === "open" && isFromAgentOf(item, row));
        return { ...facts, openCards: open.length };
      }),
    );
  }

  /** Notes that the person saw a chat's messages up to the newest of `messages`. */
  markSeen(conversation: MessagingId, messages: readonly Message[]): void {
    const newest = messages.at(-1)?.sentAt;
    if (newest !== undefined && newest > (this.seen.get(conversation) ?? "")) {
      this.seen.set(conversation, newest);
    }
  }

  /**
   * Whether a row's newest message is an agent's that the person hasn't seen open since this
   * Messenger started: the row's unread dot.
   */
  unread(row: ConversationRow): boolean {
    const { last } = row;
    if (last === undefined || last.author.kind === "me") return false;
    return last.sentAt > (this.seen.get(row.conversation.id) ?? "");
  }

  /** Whether anything is connected, so the Messenger can tell "nothing connected" from "no chats". */
  async hasSources(): Promise<boolean> {
    const sources = await this.messaging.listSources();
    return sources.length > 0;
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

  /** The agents the person picked in a channel's box (chips), in the order picked. */
  named(conversation: MessagingId): readonly MessagingId[] {
    return this.picks.get(conversation) ?? [];
  }

  /**
   * Keeps the agents the person picked in a channel's box. Only a pick names an agent: the
   * Messenger never reads names from the text (requirement `messenger.channel-authority`).
   */
  setNamed(conversation: MessagingId, agents: readonly MessagingId[]): void {
    if (agents.length === 0) this.picks.delete(conversation);
    else this.picks.set(conversation, [...agents]);
  }

  /** The open questions' text by the work they belong to, for a work line that asks the person. */
  async questions(): Promise<ReadonlyMap<MessagingId, string>> {
    const items = await this.messaging.listInboxItems();
    const open = items.filter((item) => item.state.kind === "open" && item.work !== undefined);
    return new Map(open.map((item) => [item.work ?? "", item.question]));
  }

  /**
   * Sends a conversation's draft, with the files waiting in its box. Offline
   * or signed out, it asks the source nothing and keeps the draft and the
   * files: nothing is queued to send later (ADR, Offline). A refusal from the
   * source keeps them too; only a sent message clears them, and the draft only
   * while it still holds what was sent, so text typed during the send stays.
   * In a channel it goes to the agents the person picked, or else the lead. `sending` hears the
   * text once it is on its way, so the chat can show it at once (`messenger.chat-transcript`).
   */
  async sendDraft(
    conversation: MessagingId,
    row?: ConversationRow,
    sending?: (body: string) => void,
  ): Promise<DraftOutcome> {
    const body = this.draft(conversation);
    const files = this.files.of(conversation);
    if (body.trim() === "" && files.length === 0) return { outcome: "kept", reason: "blank" };
    const refusal = row === undefined ? undefined : refusalOf(row);
    if (refusal !== undefined) return { outcome: "kept", reason: refusal };
    sending?.(body);
    const result = await this.send(conversation, body);
    if (result.outcome === "refused") return { outcome: "kept", reason: result.reason };
    if (this.draft(conversation) === body) this.drafts.delete(conversation);
    this.files.clear(conversation);
    this.picks.delete(conversation);
    return { outcome: "sent", message: result.message };
  }

  private async send(conversation: MessagingId, body: string): Promise<SendResult> {
    const outgoing = await this.files.outgoing(conversation);
    const to = this.named(conversation);
    if (to.length > 0) return this.messaging.send(conversation, body, outgoing, { to });
    return outgoing.length === 0
      ? this.messaging.send(conversation, body)
      : this.messaging.send(conversation, body, outgoing);
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

/**
 * The rows a tab lists: all of them, or only those whose agent wrote last and the channels where
 * a question waits for the person.
 */
export function inTab(
  rows: readonly ConversationRow[],
  tab: MessengerTab,
): readonly ConversationRow[] {
  if (tab === "all") return rows;
  return rows.filter((row) => row.conversation.waitingForMe || (row.questions ?? []).length > 0);
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
  const { agent: lead, members = [lead] } = conversation;
  const ids = [lead, ...members.filter((member) => member !== lead)];
  return {
    conversation,
    agents: ids.flatMap((id) => agents.find((agent) => agent.id === id) ?? []),
    sourceAgents: agents.filter((agent) => agent.source === conversation.source),
    source: sources.find((each) => each.id === conversation.source),
  };
}

/** Whether `text` holds `search`, ignoring case; an empty search matches everything. */
function holds(text: string, search: string): boolean {
  const wanted = search.trim().toLowerCase();
  return wanted === "" || text.toLowerCase().includes(wanted);
}
