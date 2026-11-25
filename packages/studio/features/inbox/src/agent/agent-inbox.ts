import type {
  InboxItem as AgentItem,
  AgentMessaging,
  AnswerResult,
  AttachmentRead,
  InboxAnswer,
  MessagingAgent,
  MessagingId,
  MessagingSource,
  WorkItem,
} from "@halonicjs/ports";

/** What the Inbox last read from `AgentMessaging`. */
export interface AgentInboxState {
  /** Whether a first read has ended, well or not. */
  readonly loaded: boolean;
  readonly sources: readonly MessagingSource[];
  /** The sources' agents, so a card says who asks: "Chief · Chief of Staff asks". */
  readonly agents: readonly MessagingAgent[];
  /** Every item, open and answered, newest first, so an open card still finds its item once answered. */
  readonly items: readonly AgentItem[];
  /** The sources' work, so each item can say which work it came from (`inbox.every-waiting-item`). */
  readonly work: readonly WorkItem[];
  /** Why the last read failed; `undefined` once one succeeds. */
  readonly error: unknown;
}

const notRead: AgentInboxState = {
  loaded: false,
  sources: [],
  agents: [],
  items: [],
  work: [],
  error: undefined,
};

/**
 * The cards and questions agents put to the person, from every `AgentMessaging` source
 * (`inbox.agent-inbox-items`). It reads them while someone listens and again each time `changes`
 * names a source; it never polls, since the engine already does.
 */
export class AgentInbox {
  state: AgentInboxState = notRead;
  private readonly messaging: AgentMessaging;
  private readonly listeners = new Set<() => void>();
  private stopReading: (() => void) | undefined;
  /** The newest read, so an older one that ends later doesn't overwrite it. */
  private reads = 0;

  constructor(messaging: AgentMessaging) {
    this.messaging = messaging;
  }

  /** Calls `listener` on each change. The first listener starts the reads, and the last to leave stops them. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (this.stopReading === undefined) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size > 0) return;
      this.stopReading?.();
      this.stopReading = undefined;
    };
  }

  /** Reads the sources, items and work again. A failed read keeps what was shown and says why. */
  async refresh(): Promise<void> {
    this.reads += 1;
    const read = this.reads;
    try {
      const [sources, agents, items, work] = await Promise.all([
        this.messaging.listSources(),
        this.messaging.listAgents(),
        this.messaging.listInboxItems(),
        this.messaging.listWork(),
      ]);
      if (read === this.reads)
        this.set({ loaded: true, sources, agents, items, work, error: undefined });
    } catch (error) {
      if (read === this.reads) this.set({ ...this.state, loaded: true, error });
    }
  }

  /** Answers an item, then reads again, so its card shows who answered whatever the outcome. */
  async answer(item: MessagingId, answer: InboxAnswer): Promise<AnswerResult> {
    try {
      return await this.messaging.answer(item, answer);
    } finally {
      void this.refresh();
    }
  }

  /** An attachment's bytes, read through the engine only when the person asks to see it. */
  readAttachment(attachment: MessagingId): Promise<AttachmentRead> {
    return this.messaging.readAttachment(attachment);
  }

  private start(): void {
    const changes = this.messaging.changes()[Symbol.asyncIterator]();
    let stopped = false;
    this.stopReading = () => {
      stopped = true;
      void changes.return?.();
    };
    void this.refresh();
    const follow = async () => {
      for (;;) {
        const change = await changes.next();
        if (stopped || change.done === true) return;
        await this.refresh();
      }
    };
    follow().catch((error: unknown) => this.set({ ...this.state, loaded: true, error }));
  }

  private set(state: AgentInboxState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
