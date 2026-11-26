import type {
  AgentMessaging,
  Clock,
  Conversation,
  InboxItem,
  MessagingAgent,
  MessagingSource,
  ScheduledTimer,
  Scheduler,
  SchedulerListener,
  WorkItem,
} from "@halonicjs/ports";
import type { MessagingFocus } from "./messaging-api.ts";

/** How often the loop reads while a client is in front, and otherwise (`server.messaging-rate`). */
export const focusedPollMs = 30 * 1000;
export const idlePollMs = 5 * 60 * 1000;
/** How long a client's focus report keeps the loop at {@link focusedPollMs}. */
export const focusLastsMs = 2 * 60 * 1000;

/** The loop's one timer on the `Scheduler` port. */
const pollTimerKey = "messaging-poll";
const pollTimerId = "next";

/** The lists one poll read, which every client's list reads answer from until the next poll. */
export interface MessagingSnapshot {
  readonly sources: readonly MessagingSource[];
  readonly agents: readonly MessagingAgent[];
  readonly conversations: readonly Conversation[];
  readonly inboxItems: readonly InboxItem[];
  readonly work: readonly WorkItem[];
  readonly channels: readonly Conversation[];
}

/** What {@link MessagingPollLoop} needs. */
export interface MessagingPollLoopOptions {
  /** The server's providers, joined; the loop reads its lists, and clients reach it for the rest. */
  readonly source: AgentMessaging;
  /** Reads every source again and tells `changes` readers what changed, as the hub's `refresh` does. */
  readonly refresh: () => Promise<void>;
  /** Makes the scheduler of the loop's timer, with the loop as its listener; the runtime's own. */
  readonly createScheduler: (listener: SchedulerListener) => Scheduler & { close(): Promise<void> };
  readonly clock: Clock;
  /** Hears a poll or a timer change that failed; the loop carries on with the next poll. */
  readonly report: (error: unknown) => void;
}

/** A snapshot, and the generation of the source it was read from. */
interface Kept {
  readonly generation: number;
  readonly snapshot: MessagingSnapshot;
}

/**
 * The server's one poll loop over its messaging (`server.messaging-rate`): it reads the sources
 * about every 30 seconds while any client reported focus in the last 2 minutes, and every 5
 * minutes otherwise, through the `Scheduler` port. Clients' list reads answer from what the
 * last poll read, so the number of clients never multiplies the calls to Paperclip.
 *
 * What a poll read belongs to one generation of the source. A write, a sign-in or a Disconnect
 * starts a new one ({@link invalidate}): a poll of the generation before is thrown away when it
 * ends, and the next list read waits for a poll of the new one. So after Disconnect no read
 * answers from a poll made with the removed key.
 */
export class MessagingPollLoop {
  readonly #source: AgentMessaging;
  readonly #refresh: () => Promise<void>;
  readonly #clock: Clock;
  readonly #report: (error: unknown) => void;
  readonly #createScheduler: MessagingPollLoopOptions["createScheduler"];
  /** Made at the loop's first timer, so a loop that never started holds no timer. */
  #scheduler: (Scheduler & { close(): Promise<void> }) | undefined;
  #closed = false;
  #generation = 0;
  #kept: Kept | undefined;
  #polling: { readonly generation: number; readonly done: Promise<MessagingSnapshot> } | undefined;
  #lastPollAt: number | undefined;
  #focusAt: number | undefined;
  /** The ISO time the loop's timer is set for; a delivery for any other time is late or repeated. */
  #nextAt: string | undefined;

  constructor(options: MessagingPollLoopOptions) {
    this.#source = options.source;
    this.#refresh = options.refresh;
    this.#clock = options.clock;
    this.#report = options.report;
    this.#createScheduler = options.createScheduler;
  }

  /** The messaging the loop reads; list reads go through {@link snapshot} instead. */
  get source(): AgentMessaging {
    return this.#source;
  }

  /**
   * Polls once, so the first clients' reads find the lists ready, and sets the next poll. A
   * first poll that fails is reported, and the next list read polls again.
   */
  async start(): Promise<void> {
    await this.#poll().catch(this.#report);
  }

  /** Stops the timer; a poll in progress still ends, and sets no timer after. */
  async close(): Promise<void> {
    this.#closed = true;
    await this.#scheduler?.close();
  }

  /** Where `POST /api/messaging/focus` reports go. It never throws. */
  readonly focus: MessagingFocus = {
    report: (inFront) => {
      if (!inFront) return;
      this.#focusAt = this.#now();
      const soonest = (this.#lastPollAt ?? this.#now()) + focusedPollMs;
      if (this.#nextAt === undefined || Date.parse(this.#nextAt) > soonest) {
        this.#scheduleAt(soonest).catch(this.#report);
      }
    },
  };

  /** What the last poll of the source as it is now read; polls first when there is none. */
  snapshot(): Promise<MessagingSnapshot> {
    const kept = this.#kept;
    return kept !== undefined && kept.generation === this.#generation
      ? Promise.resolve(kept.snapshot)
      : this.#poll();
  }

  /**
   * Forgets what the polls read so far: after a write, or after a sign-in or Disconnect changed
   * the source. The next list read polls again.
   */
  invalidate(): void {
    this.#generation += 1;
    this.#kept = undefined;
  }

  /** One poll for the current generation at a time; a read while one runs waits for it. */
  #poll(): Promise<MessagingSnapshot> {
    const polling = this.#polling;
    if (polling !== undefined && polling.generation === this.#generation) return polling.done;
    const generation = this.#generation;
    const done = this.#read(generation).finally(() => {
      if (this.#polling?.done === done) this.#polling = undefined;
    });
    this.#polling = { generation, done };
    return done;
  }

  async #read(generation: number): Promise<MessagingSnapshot> {
    const source = this.#source;
    try {
      await this.#refresh();
      const [sources, agents, conversations, inboxItems, work, channels] = await Promise.all([
        source.listSources(),
        source.listAgents(),
        source.listConversations(),
        source.listInboxItems(),
        source.listWork(),
        source.browseChannels(),
      ]);
      const snapshot = { sources, agents, conversations, inboxItems, work, channels };
      if (generation === this.#generation) this.#kept = { generation, snapshot };
      return snapshot;
    } finally {
      this.#lastPollAt = this.#now();
      await this.#scheduleFrom(this.#lastPollAt).catch(this.#report);
    }
  }

  /** A due timer polls once; a poll that fails is reported, and the next one is set either way. */
  async #onTimer(timer: ScheduledTimer): Promise<void> {
    if (timer.key !== pollTimerKey || timer.at !== this.#nextAt) return;
    await this.#poll().catch(this.#report);
  }

  /** Sets the next poll after `from`: the short wait while a client is in front, else the long one. */
  #scheduleFrom(from: number): Promise<void> {
    const focused = this.#focusAt !== undefined && from - this.#focusAt < focusLastsMs;
    return this.#scheduleAt(from + (focused ? focusedPollMs : idlePollMs));
  }

  #scheduleAt(at: number): Promise<void> {
    if (this.#closed) return Promise.resolve();
    const iso = new Date(Math.max(at, this.#now())).toISOString();
    this.#nextAt = iso;
    this.#scheduler ??= this.#createScheduler({
      onTimer: (timer) => this.#onTimer(timer),
      onTick: async () => undefined,
    });
    return this.#scheduler.schedule(pollTimerKey, pollTimerId, iso);
  }

  #now(): number {
    return this.#clock.now().getTime();
  }
}
