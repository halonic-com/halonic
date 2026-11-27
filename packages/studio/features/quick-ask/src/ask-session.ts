import type {
  InboxItem,
  Message,
  MessagingAgent,
  MessagingId,
  MessagingRefusal,
} from "@halonicjs/ports";
import type {
  ConversationRow,
  DraftOutcome,
  Messenger,
} from "@halonicjs/studio-feature-messenger/api";
import { type AnswerState, answerState, isAgentReply, isAnswered, isLater } from "./ask-answer.ts";
import type { AskMemory } from "./ask-memory.ts";

/**
 * The part of the {@link Messenger} the box uses. The box asks through Messenger's own chats, so
 * a question is a normal message in the person's chat with the agent and nothing is kept twice.
 */
export interface AskMessenger {
  rows(): Promise<readonly ConversationRow[]>;
  messages(conversation: MessagingId): Promise<readonly Message[]>;
  sendText(conversation: MessagingId, body: string, row?: ConversationRow): Promise<DraftOutcome>;
  watch(listener: (source: MessagingId) => void): () => void;
  readonly quickActions: { cards(row: ConversationRow): Promise<readonly InboxItem[]> };
}

/** An agent the box can ask: one with a 1:1 chat in Messenger. */
export interface AskAgent {
  readonly agent: MessagingAgent;
  /** The chat the question goes to. */
  readonly row: ConversationRow;
}

/** An answer that came after the box was closed: the box's **Last answer: Liam, 13:41 ›**. */
export interface LastAnswer {
  readonly conversation: MessagingId;
  readonly agentName: string;
  readonly sentAt: string;
}

/** What the box shows when it opens. */
export type AskOpening =
  | { readonly kind: "no-agents" }
  | {
      readonly kind: "ready";
      readonly agents: readonly AskAgent[];
      /** The agent asked last, or else the first one. */
      readonly agent: AskAgent;
      /** The text typed and not sent last time. */
      readonly text: string;
      readonly lastAnswer?: LastAnswer;
    };

/** What pressing Enter did: the question is in the chat, or it wasn't sent and stays in the box. */
export type AskOutcome =
  | { readonly kind: "sent"; readonly question: Message }
  | { readonly kind: "not-sent"; readonly reason: MessagingRefusal | "blank" };

/**
 * The quick-ask box's work, without its screen (requirements `quick-ask.session` and
 * `quick-ask.answer`): which agents it offers and which is picked, the text not sent yet,
 * sending a question into the agent's chat, and watching for the answer while the box is open.
 * It keeps nothing in memory between opens; {@link AskMemory} keeps it in the page's storage.
 *
 * @example
 * const session = new AskSession(messenger, new AskMemory(window.localStorage));
 * const opening = await session.open();
 * if (opening.kind === "ready") {
 *   const outcome = await session.ask(opening.agent, "Where are we with the release?");
 *   if (outcome.kind === "sent") session.watch(opening.agent, outcome.question, show);
 * }
 */
export class AskSession {
  readonly #messenger: AskMessenger;
  readonly #memory: AskMemory;

  constructor(messenger: AskMessenger, memory: AskMemory) {
    this.#messenger = messenger;
    this.#memory = memory;
  }

  /** The agents to offer, the one to pick, the unsent text, and an answer that came while closed. */
  async open(): Promise<AskOpening> {
    const agents = askableAgents(await this.#messenger.rows());
    const first = agents[0];
    if (first === undefined) return { kind: "no-agents" };
    const last = this.#memory.lastAgent();
    const agent = agents.find((each) => each.row.conversation.id === last) ?? first;
    const lastAnswer = await this.#lastAnswer(agents);
    const ready = { kind: "ready" as const, agents, agent, text: this.#memory.unsent() };
    return lastAnswer === undefined ? ready : { ...ready, lastAnswer };
  }

  /** The text typed and not sent last time, at once, so the box takes typing before the agents are read. */
  unsent(): string {
    return this.#memory.unsent();
  }

  /** Remembers the agent the person picked, so the next open starts with it. */
  pick(agent: AskAgent): void {
    this.#memory.setLastAgent(agent.row.conversation.id);
  }

  /** Keeps what is typed in the box, so it is there again after the box closes. */
  type(text: string): void {
    this.#memory.setUnsent(text);
  }

  /**
   * Sends a question into the agent's chat through Messenger. Sent, the box's text is cleared and
   * the question waits for its answer; not sent, the text stays in the box to try again.
   */
  async ask(agent: AskAgent, text: string): Promise<AskOutcome> {
    const conversation = agent.row.conversation.id;
    if (text.trim() === "") return { kind: "not-sent", reason: "blank" };
    const outcome = await this.#messenger.sendText(conversation, text, agent.row);
    if (outcome.outcome === "kept") return { kind: "not-sent", reason: outcome.reason };
    this.#memory.setUnsent("");
    this.#memory.setLastAgent(conversation);
    this.#memory.setPending({ conversation, sentAt: outcome.message.sentAt });
    return { kind: "sent", question: outcome.message };
  }

  /** Forgets the answer behind **Last answer ›**, once the person opened it or asked again. */
  forgetLastAnswer(): void {
    this.#memory.setPending(undefined);
  }

  /**
   * Tells `listener` where the answer to `question` stands now, and again each time the agent's
   * source changes, until the returned function is called: the box calls it when it closes. It
   * reads on Messenger's changes and never polls. An answer seen here no longer shows as
   * **Last answer ›**.
   */
  watch(agent: AskAgent, question: Message, listener: (state: AnswerState) => void): () => void {
    let stopped = false;
    let reading: Promise<void> = Promise.resolve();
    const readOnce = async (): Promise<void> => {
      if (stopped) return;
      const state = await this.#answerTo(agent, question);
      if (stopped) return;
      if (isAnswered(state)) this.#memory.setPending(undefined);
      listener(state);
    };
    const read = (): void => {
      // One read at a time, in order, so an older read never overwrites a newer state. A failed
      // read is logged and ends only itself: the next change reads again.
      reading = reading.then(readOnce).catch((error: unknown) => {
        console.error(
          "Quick ask couldn't read the answer; it reads again on the next change:",
          error,
        );
      });
    };
    const stopWatching = this.#messenger.watch((source) => {
      if (source === agent.row.conversation.source) read();
    });
    read();
    return () => {
      stopped = true;
      stopWatching();
    };
  }

  async #answerTo(agent: AskAgent, question: Message): Promise<AnswerState> {
    const conversation = agent.row.conversation.id;
    const rows = await this.#messenger.rows();
    const row = rows.find((each) => each.conversation.id === conversation) ?? agent.row;
    const [messages, cards] = await Promise.all([
      this.#messenger.messages(conversation),
      this.#messenger.quickActions.cards(row),
    ]);
    const now = row.agents[0] ?? agent.agent;
    return answerState({ agent: now, messages, cards, sentAt: question.sentAt });
  }

  /**
   * The agent's newest message since the waiting question, when it came after the box closed. A
   * chat that can't be read is logged and shows no **Last answer ›**, so the box still opens.
   */
  async #lastAnswer(agents: readonly AskAgent[]): Promise<LastAnswer | undefined> {
    const pending = this.#memory.pending();
    if (pending === undefined) return undefined;
    // A question asked in another workspace's chat is that workspace's: kept, but not shown here.
    if (!agents.some((each) => each.row.conversation.id === pending.conversation)) return undefined;
    let messages: readonly Message[];
    try {
      messages = await this.#messenger.messages(pending.conversation);
    } catch (error: unknown) {
      console.error("Quick ask couldn't read the chat for its last answer:", error);
      return undefined;
    }
    const reply = messages.findLast(
      (message) => isAgentReply(message) && isLater(message.sentAt, pending.sentAt),
    );
    if (reply === undefined || reply.author.kind !== "agent") return undefined;
    return {
      conversation: pending.conversation,
      agentName: reply.author.name,
      sentAt: reply.sentAt,
    };
  }
}

/** The 1:1 chats with a known agent, in Messenger's order (newest first): channels aren't offered. */
export function askableAgents(rows: readonly ConversationRow[]): readonly AskAgent[] {
  return rows.flatMap((row) => {
    const agent = row.agents[0];
    if (row.conversation.members !== undefined || agent === undefined) return [];
    return [{ agent, row }];
  });
}
