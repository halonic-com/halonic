import type { Clock, ScheduledTimer, Scheduler } from "@halonicjs/ports";
import { type EventsState, type PollRates, pollRates } from "./poll-rates.ts";

/** The scheduler key and timer ID of the sync's poll. One host polls once, for every source. */
export const syncPollTimer = { key: "agent-messaging", timerId: "poll" } as const;

/** What a {@link SyncScheduler} needs: the scheduler, the time, and the poll it repeats. */
export interface SyncSchedulerOptions {
  scheduler: Scheduler;
  clock: Clock;
  /**
   * Brings every source's local copy up to date, such as `MessagingHub.refresh`. A source names
   * itself on `changes` only when its copy changed. It reports its own failures and never rejects.
   */
  poll: () => Promise<void>;
  /** The scheduler key and timer ID; {@link syncPollTimer} unless told otherwise. */
  timer?: { key: string; timerId: string };
  /** The waits; {@link pollRates} unless told otherwise. */
  rates?: PollRates;
  /**
   * Whether a chat waits for its agent, such as `ReplyWatch.waiting`. Asked only while a window
   * is open and within `waitingForMs` of the last {@link SyncScheduler.expectReply}; never rejects.
   */
  waiting?: () => Promise<boolean>;
}

/**
 * When the sync polls (requirement `agent-host.paperclip-polling`): at once on start, as the first
 * full load; then by the {@link pollRates} table, by whether a window is open and whether the
 * source's live events are connected; and at once when a window opens, when events (re)connect
 * (the catch-up, since events can't be replayed) and when {@link pollNow} asks. Every wait is a
 * timer on the {@link Scheduler} port; the host's scheduler listener hands them to {@link onTimer}.
 *
 * @example
 * const sync = new SyncScheduler({ scheduler, clock, poll: () => hub.refresh() });
 * await sync.start();
 * await sync.setWindowOpen(false); // Studio went to the background
 */
export class SyncScheduler {
  readonly #scheduler: Scheduler;
  readonly #clock: Clock;
  readonly #poll: () => Promise<void>;
  readonly #timer: { key: string; timerId: string };
  readonly #rates: PollRates;
  readonly #waiting: () => Promise<boolean>;
  #windowOpen = true;
  #events: EventsState = "down";
  /** Until when, in milliseconds since 1970, a waiting chat may make the sync poll faster. */
  #fastUntil = 0;
  /** The time the poll's timer is set for; a delivery for any other time is late or repeated, and dropped. */
  #dueAt: string | undefined;

  constructor(options: SyncSchedulerOptions) {
    this.#scheduler = options.scheduler;
    this.#clock = options.clock;
    this.#poll = options.poll;
    this.#timer = options.timer ?? syncPollTimer;
    this.#rates = options.rates ?? pollRates;
    this.#waiting = options.waiting ?? (async () => false);
  }

  /** Starts with the first full load at once, with a window open unless told otherwise. */
  async start(windowOpen = true): Promise<void> {
    this.#windowOpen = windowOpen;
    await this.#scheduleIn(0);
  }

  /** Tells the sync whether a window is open. Opening one polls at once. */
  async setWindowOpen(open: boolean): Promise<void> {
    const opened = open && !this.#windowOpen;
    this.#windowOpen = open;
    if (opened) await this.pollNow();
  }

  /**
   * Tells the sync whether live events reach it. A (re)connect polls at once, to catch up on
   * what happened while they were down; losing them brings the next poll forward to the faster
   * rate without events.
   */
  async setEvents(state: EventsState): Promise<void> {
    const connected = state === "connected" && this.#events !== "connected";
    this.#events = state;
    if (connected) await this.pollNow();
    else await this.#notLaterThan(await this.#interval());
  }

  /**
   * Polls at once, then on the usual schedule: a sign-in that just connected a source, or events
   * that say they were missed, call it. Does nothing once stopped.
   */
  async pollNow(): Promise<void> {
    if (this.#dueAt === undefined) return;
    await this.#scheduleIn(0);
  }

  /**
   * The person just sent: for the next `waitingForMs`, while a window is open, the sync polls
   * every `whileWaitingMs` while a chat waits for its agent. Does nothing once stopped.
   */
  async expectReply(): Promise<void> {
    this.#fastUntil = this.#clock.now().getTime() + this.#rates.waitingForMs;
    if (this.#windowOpen) await this.#notLaterThan(this.#rates.whileWaitingMs);
  }

  /** Handles a scheduler timer. Returns `false` for a timer that isn't the poll's, so the listener passes it on. */
  async onTimer(timer: ScheduledTimer): Promise<boolean> {
    if (timer.key !== this.#timer.key || timer.timerId !== this.#timer.timerId) return false;
    if (timer.at !== this.#dueAt) return true;
    await this.#poll();
    // The next wait starts after this poll, unless something asked for a poll meanwhile.
    if (this.#dueAt !== timer.at) return true;
    const wait = await this.#interval();
    if (this.#dueAt === timer.at) await this.#scheduleIn(wait);
    return true;
  }

  /** Stops polling: the timer is removed and later deliveries are dropped. */
  async stop(): Promise<void> {
    this.#dueAt = undefined;
    await this.#scheduler.cancel(this.#timer.key, this.#timer.timerId);
  }

  async #interval(): Promise<number> {
    const rates = this.#rates[this.#events];
    if (!this.#windowOpen) return rates.windowClosedMs;
    const fast = this.#clock.now().getTime() < this.#fastUntil;
    if (fast && (await this.#waiting())) {
      return Math.min(this.#rates.whileWaitingMs, rates.windowOpenMs);
    }
    return rates.windowOpenMs;
  }

  /** Moves a poll due later than `ms` from now to then. Does nothing once stopped. */
  async #notLaterThan(ms: number): Promise<void> {
    if (this.#dueAt === undefined) return;
    if (Date.parse(this.#dueAt) > this.#clock.now().getTime() + ms) await this.#scheduleIn(ms);
  }

  async #scheduleIn(ms: number): Promise<void> {
    const at = new Date(this.#clock.now().getTime() + ms).toISOString();
    this.#dueAt = at;
    await this.#scheduler.schedule(this.#timer.key, this.#timer.timerId, at);
  }
}
