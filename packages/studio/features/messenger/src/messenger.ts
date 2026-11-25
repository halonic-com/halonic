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
  TeamStatus,
} from "@halonicjs/ports";
import { ChannelAdmin } from "./channel-admin.ts";
import { type ChannelQuestion, channelQuestions } from "./channel-waiting.ts";
import { type FoundChat, findChats } from "./chat-search.ts";
import { DraftFiles } from "./draft-files.ts";
import { type WaitingCard, waitingCards } from "./needs-you.ts";
import { isFromAgentOf, QuickActions } from "./quick-actions.ts";
import { refusalOf } from "./refusal.ts";

export { refusalOf } from "./refusal.ts";

/**
 * The reads of the activity panel: `AgentActivityService`'s shape, written from the ports so the
 * Messenger's words still load in Node, without the Studio's services.
 */
type ActivityReads = Required<Pick<TeamStatus, "runs">> & Pick<TeamStatus, "pullRequests">;

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
  /** The newest message that isn't an automatic note, for the row's preview and time; none in an empty chat. */
  readonly last?: Message;
  /** How many of the chat agent's cards are open, for the row's violet dot. */
  readonly openCards?: number;
  /**
   * When each agent's message since the person's own newest one was sent, oldest first; automatic
   * notes left out. The row's unread count is those the person hasn't seen.
   */
  readonly incoming?: readonly string[];
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
  /** What the agents are doing, for the activity panel; none where no agent host serves it. */
  readonly activity: ActivityReads | undefined;
  private readonly messaging: AgentMessaging;
  private readonly drafts = new Map<MessagingId, string>();
  private readonly picks = new Map<MessagingId, readonly MessagingId[]>();
  /** When the newest message the person saw in each chat was sent, while this Messenger lives. */
  private readonly seen = new Map<MessagingId, string>();

  constructor(
    messaging: AgentMessaging,
    now: () => Date = () => new Date(),
    activity?: ActivityReads,
  ) {
    this.messaging = messaging;
    this.now = now;
    this.activity = activity;
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
        const messages = await this.newestOf(row);
        // An automatic note isn't the agent's answer: the row's preview and unread dot skip it.
        const last = messages.findLast((message) => message.automatic !== true);
        const facts = {
          ...(last === undefined ? row : { ...row, last }),
          incoming: incoming(messages),
        };
        if (row.conversation.members !== undefined) {
          return { ...facts, questions: channelQuestions(row, messages, items) };
        }
        const open = items.filter((item) => item.state.kind === "open" && isFromAgentOf(item, row));
        return { ...facts, openCards: open.length };
      }),
    );
  }

  /**
   * A row's messages, for its preview. One whose read fails costs only that row its preview (and
   * a channel its questions); the rest of the list still shows.
   */
  private async newestOf(row: ConversationRow): Promise<readonly Message[]> {
    try {
      return await this.messaging.listMessages(row.conversation.id);
    } catch (error: unknown) {
      console.error(`The Messenger couldn't read the messages of ${row.conversation.id}:`, error);
      return [];
    }
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

  /**
   * How many agent's messages a row holds that the person hasn't seen: those since the person's
   * own newest message and since they last had the chat open (`messenger.chat-rows`).
   */
  unreadCount(row: ConversationRow): number {
    const seen = this.seen.get(row.conversation.id) ?? "";
    return (row.incoming ?? []).filter((sentAt) => sentAt > seen).length;
  }

  /**
   * Sends one of the person's messages again, to `agent` only, after that agent's work ended
   * without an answer (**Ask again**, flow J). Its files aren't sent again: the port gives back only
   * their names. Offline or signed out, it asks the source nothing.
   */
  async askAgain(row: ConversationRow, message: Message, agent: MessagingId): Promise<SendResult> {
    const refusal = refusalOf(row);
    if (refusal !== undefined) return { outcome: "refused", reason: refusal };
    return this.messaging.send(row.conversation.id, message.body, [], { to: [agent] });
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

  /** The conversations of `rows` whose name or messages hold `search` (`messenger.chat-search`). */
  findChats(rows: readonly ConversationRow[], search: string): Promise<readonly FoundChat[]> {
    return findChats(rows, search, (row) => this.newestOf(row));
  }

  /** Everything waiting for the person across `rows`, oldest first (`messenger.needs-you`). */
  async needsYou(rows: readonly ConversationRow[]): Promise<readonly WaitingCard[]> {
    return waitingCards(rows, await this.messaging.listInboxItems());
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
   * text and the files' names once they are on their way, so the chat can show them at once
   * (`messenger.chat-transcript`).
   */
  async sendDraft(
    conversation: MessagingId,
    row?: ConversationRow,
    sending?: (body: string, files: readonly string[]) => void,
  ): Promise<DraftOutcome> {
    const body = this.draft(conversation);
    const files = this.files.of(conversation);
    if (body.trim() === "" && files.length === 0) return { outcome: "kept", reason: "blank" };
    const refusal = row === undefined ? undefined : refusalOf(row);
    if (refusal !== undefined) return { outcome: "kept", reason: refusal };
    sending?.(
      body,
      files.map((file) => file.name),
    );
    const result = await this.send(conversation, body);
    if (result.outcome === "refused") return { outcome: "kept", reason: result.reason };
    if (this.draft(conversation) === body) this.drafts.delete(conversation);
    this.files.clear(conversation);
    this.picks.delete(conversation);
    return { outcome: "sent", message: result.message };
  }

  /**
   * Sends exactly `body` to a conversation's lead, for a box outside the Messenger, such as quick
   * ask (requirement `messenger.send-text`). It leaves the conversation's draft, its waiting files
   * and its picked agents as they are, so what the person typed in the Messenger stays theirs.
   * Blank text, or a source that is offline or signed out, sends nothing, as with
   * {@link Messenger.sendDraft}.
   */
  async sendText(
    conversation: MessagingId,
    body: string,
    row?: ConversationRow,
  ): Promise<DraftOutcome> {
    if (body.trim() === "") return { outcome: "kept", reason: "blank" };
    const refusal = row === undefined ? undefined : refusalOf(row);
    if (refusal !== undefined) return { outcome: "kept", reason: refusal };
    const result = await this.messaging.send(conversation, body);
    if (result.outcome === "refused") return { outcome: "kept", reason: result.reason };
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

/** When each agent's message after the person's own newest one was sent; automatic notes left out. */
function incoming(messages: readonly Message[]): readonly string[] {
  const mine = messages.findLastIndex((message) => message.author.kind === "me");
  return messages
    .slice(mine + 1)
    .filter((message) => message.automatic !== true)
    .map((message) => message.sentAt);
}

/** Whether `text` holds `search`, ignoring case; an empty search matches everything. */
export function holds(text: string, search: string): boolean {
  const wanted = search.trim().toLowerCase();
  return wanted === "" || text.toLowerCase().includes(wanted);
}
