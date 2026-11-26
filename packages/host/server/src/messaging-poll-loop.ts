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
  /** Hears a failed `refresh`, list read or timer change; the loop carries on with the next poll. */
  readonly report: (error: unknown) => void;
}

/** The name of one list a poll reads. */
export type MessagingListName = keyof MessagingSnapshot;

/** Each list's last good value; a list with none is missing. */
type KeptLists = { -readonly [Name in MessagingListName]?: MessagingSnapshot[Name] };

/** What the polls of one generation of the source read: each list's last good value, or why it has none. */
interface Kept {
  readonly generation: number;
  readonly lists: KeptLists;
  readonly failures: Partial<Record<MessagingListName, unknown>>;
}

/** A poll, or a poll's list reads, and the generation of the source it reads. */
interface Running {
  readonly generation: number;
  readonly done: Promise<Kept>;
}

/**
 * The server's one poll loop over its messaging (`server.messaging-rate`): it reads the sources
 * about every 30 seconds while any client reported focus in the last 2 minutes, and every 5
 * minutes otherwise, through the `Scheduler` port. Clients' list reads answer from what the
 * last poll read, so the number of clients never multiplies the calls to Paperclip.
 *
 * A poll first runs `refresh`, which tells `changes` readers what changed, then reads the lists.
 * A client that hears a change reads again at once, so a list read made while a poll reads its
 * lists waits for them: it never answers from the poll before the change.
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
  #polling: Running | undefined;
  /** The running poll once its `refresh` is done, while it reads the lists. */
  #listing: Running | undefined;
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

  /** The messaging the loop reads; list reads go through {@link list} instead. */
  get source(): AgentMessaging {
    return this.#source;
  }

  /** Polls once, so the first clients' reads find the lists ready, and sets the next poll. */
  async start(): Promise<void> {
    await this.#poll();
  }

  /**
   * Stops the timer. A poll in progress still ends, and sets no timer after; `close` doesn't
   * wait for it, so a stalled Paperclip never holds up the server's end.
   */
  async close(): Promise<void> {
    this.#closed = true;
    await this.#scheduler?.close();
  }

  /**
   * Resolves once the poll running now, if any, has ended. A timer doesn't wait for its poll,
   * so a test that lets time pass waits here before the next timer is due.
   */
  async idle(): Promise<void> {
    for (let polling = this.#polling; polling !== undefined; polling = this.#polling) {
      await polling.done.catch(() => undefined);
    }
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

  /**
   * One list as the last poll of the source as it is now read it; polls first when there is
   * none. When that poll's read of this list failed and the generation has no good value of it
   * yet, the read fails with that failure; the other lists still answer.
   */
  async list<Name extends MessagingListName>(name: Name): Promise<MessagingSnapshot[Name]> {
    const kept = await this.#current();
    const value: MessagingSnapshot[Name] | undefined = kept.lists[name];
    if (value === undefined) throw kept.failures[name];
    return value;
  }

  /**
   * Forgets what the polls read so far: after a write, or after a sign-in or Disconnect changed
   * the source. The next list read polls again.
   */
  invalidate(): void {
    this.#generation += 1;
    this.#kept = undefined;
  }

  /** What list reads answer from now: a poll's lists still being read, the last poll's, or a new poll's. */
  #current(): Promise<Kept> {
    const generation = this.#generation;
    if (this.#listing?.generation === generation) return this.#listing.done;
    if (this.#kept?.generation === generation) return Promise.resolve(this.#kept);
    return this.#poll();
  }

  /**
   * One poll for the current generation at a time; a read while one runs waits for it. The next
   * poll is set when one starts, so a poll that takes long never holds up the timer.
   */
  #poll(): Promise<Kept> {
    const polling = this.#polling;
    if (polling !== undefined && polling.generation === this.#generation) return polling.done;
    const generation = this.#generation;
    this.#lastPollAt = this.#now();
    this.#scheduleFrom(this.#lastPollAt).catch(this.#report);
    const done = this.#read(generation).finally(() => {
      if (this.#polling?.done === done) this.#polling = undefined;
    });
    this.#polling = { generation, done };
    return done;
  }

  /** Runs `refresh`, then reads the lists; a failed `refresh` is reported and the lists still read. */
  async #read(generation: number): Promise<Kept> {
    await this.#refresh().catch(this.#report);
    const done = this.#readLists(generation);
    this.#listing = { generation, done };
    try {
      return await done;
    } finally {
      if (this.#listing?.done === done) this.#listing = undefined;
    }
  }

  /**
   * Reads every list on its own, so one that fails never holds back the others. A failed list
   * keeps the generation's last good value, and its failure is reported.
   */
  async #readLists(generation: number): Promise<Kept> {
    const source = this.#source;
    const before = this.#kept?.generation === generation ? this.#kept : undefined;
    const kept: Kept = { generation, lists: {}, failures: {} };
    await Promise.all([
      this.#readList(kept, before, "sources", () => source.listSources()),
      this.#readList(kept, before, "agents", () => source.listAgents()),
      this.#readList(kept, before, "conversations", () => source.listConversations()),
      this.#readList(kept, before, "inboxItems", () => source.listInboxItems()),
      this.#readList(kept, before, "work", () => source.listWork()),
      this.#readList(kept, before, "channels", () => source.browseChannels()),
    ]);
    if (generation === this.#generation) this.#kept = kept;
    return kept;
  }

  async #readList<Name extends MessagingListName>(
    kept: Kept,
    before: Kept | undefined,
    name: Name,
    read: () => Promise<MessagingSnapshot[Name]>,
  ): Promise<void> {
    try {
      kept.lists[name] = await read();
    } catch (error) {
      this.#report(error);
      const last: MessagingSnapshot[Name] | undefined = before?.lists[name];
      if (last === undefined) kept.failures[name] = error;
      else kept.lists[name] = last;
    }
  }

  /**
   * A due timer starts a poll without waiting for it: the scheduler's `close` waits for a
   * delivery in progress. A poll still running counts as this one, and the next is set from now.
   */
  #onTimer(timer: ScheduledTimer): Promise<void> {
    if (timer.key !== pollTimerKey || timer.at !== this.#nextAt) return Promise.resolve();
    if (this.#polling?.generation === this.#generation) {
      this.#scheduleFrom(this.#now()).catch(this.#report);
    } else {
      this.#poll().catch(this.#report);
    }
    return Promise.resolve();
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
