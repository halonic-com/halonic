import type { Clock, ScheduledTimer, Scheduler } from "@halonicjs/ports";

/** How often the providers are read while Studio's window is in front. */
export const pollInFrontMs = 30_000;
/** How often the providers are read while Studio's window is in the background. */
export const pollInBackgroundMs = 5 * 60_000;
/** How often the providers are read while Studio is in front and a chat waits for its agent. */
export const pollWhileWaitingMs = 5_000;
/** How long after the person's last send the poller may read that often, so a stuck run doesn't keep it fast. */
export const fastPollWindowMs = 3 * 60_000;

/** The scheduler key and timer ID of the poll. One host polls once, for every provider. */
export const messagingPollTimer = { key: "agent-messaging", timerId: "poll" } as const;

/** What a {@link MessagingPoller} needs: the scheduler, the time, and the read it repeats. */
export interface MessagingPollerOptions {
  scheduler: Scheduler;
  clock: Clock;
  /** Reads every provider again, such as `MessagingHub.refresh`. It reports its own failures and never rejects. */
  poll: () => Promise<void>;
  /** The scheduler key and timer ID; {@link messagingPollTimer} unless told otherwise. */
  timer?: { key: string; timerId: string };
  /** The waits in front and in the background; {@link pollInFrontMs} and {@link pollInBackgroundMs} unless told otherwise. */
  every?: { inFrontMs: number; inBackgroundMs: number };
  /**
   * Whether a chat waits for its agent, such as `ReplyWatch.waiting`. Asked only in front
   * and within {@link fastPollWindowMs} of the last {@link MessagingPoller.expectReply}; never rejects.
   * Without it the poller never reads faster than every {@link pollInFrontMs}.
   */
  waiting?: () => Promise<boolean>;
}

/**
 * Reads the messaging providers on a schedule (requirement
 * `agent-host.paperclip-polling`): about every 30 seconds while Studio's
 * window is in front, every 5 minutes in the background, and at once when it
 * comes back to the front. In front, for 3 minutes after the person sends,
 * it reads every 5 seconds while a chat waits for its agent, so the agent's
 * typing line shows soon after its run starts. Every wait is a timer on the {@link Scheduler}
 * port, never a timer of its own; the host's scheduler listener hands its
 * timers to {@link onTimer}. A poll that finds a change is reported on
 * `changes` by the provider that found it; one that finds none says nothing.
 *
 * @example
 * const poller = new MessagingPoller({ scheduler, clock, poll: () => hub.refresh() });
 * await poller.start();
 * await poller.setInFront(false); // Studio went to the background
 */
export class MessagingPoller {
  readonly #scheduler: Scheduler;
  readonly #clock: Clock;
  readonly #poll: () => Promise<void>;
  readonly #timer: { key: string; timerId: string };
  readonly #every: { inFrontMs: number; inBackgroundMs: number };
  readonly #waiting: () => Promise<boolean>;
  #inFront = true;
  /** Until when, in milliseconds since 1970, a waiting chat makes the poller read every 5 seconds. */
  #fastUntil = 0;
  /** The time the poll's timer is set for; a delivery for any other time is late or repeated, and dropped. */
  #dueAt: string | undefined;

  constructor(options: MessagingPollerOptions) {
    this.#scheduler = options.scheduler;
    this.#clock = options.clock;
    this.#poll = options.poll;
    this.#timer = options.timer ?? messagingPollTimer;
    this.#every = options.every ?? {
      inFrontMs: pollInFrontMs,
      inBackgroundMs: pollInBackgroundMs,
    };
    this.#waiting = options.waiting ?? (async () => false);
  }

  /** Starts polling, with Studio's window in front unless told otherwise. */
  async start(inFront = true): Promise<void> {
    this.#inFront = inFront;
    await this.#scheduleIn(await this.#interval());
  }

  /**
   * Tells the poller whether Studio's window is in front. Coming to the front
   * polls at once; going to the background makes the next wait 5 minutes.
   */
  async setInFront(inFront: boolean): Promise<void> {
    const cameToFront = inFront && !this.#inFront;
    this.#inFront = inFront;
    if (this.#dueAt === undefined) return;
    if (cameToFront) await this.#scheduleIn(0);
  }

  /**
   * Polls at once, then on the usual schedule. A sign-in that just connected
   * a source calls it: until a source's first answer it reads as offline, so
   * without it Studio would show a new connection offline until the next
   * poll. Does nothing once stopped.
   */
  async pollNow(): Promise<void> {
    if (this.#dueAt === undefined) return;
    await this.#scheduleIn(0);
  }

  /**
   * The person just sent: for the next 3 minutes, in front, the poller reads
   * every 5 seconds while a chat waits for its agent. A poll due later than
   * 5 seconds from now moves to then. Does nothing once stopped.
   */
  async expectReply(): Promise<void> {
    const now = this.#clock.now().getTime();
    this.#fastUntil = now + fastPollWindowMs;
    if (this.#dueAt === undefined || !this.#inFront) return;
    if (Date.parse(this.#dueAt) > now + pollWhileWaitingMs) {
      await this.#scheduleIn(pollWhileWaitingMs);
    }
  }

  /**
   * Handles a scheduler timer. Returns `false` for a timer that isn't the
   * poll's, so the host's listener passes it on.
   */
  async onTimer(timer: ScheduledTimer): Promise<boolean> {
    if (timer.key !== this.#timer.key || timer.timerId !== this.#timer.timerId) return false;
    if (timer.at !== this.#dueAt) return true;
    await this.#poll();
    // The next wait starts after this poll, unless the window came to the front or the person sent meanwhile.
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
    if (!this.#inFront) return this.#every.inBackgroundMs;
    const fast = this.#clock.now().getTime() < this.#fastUntil;
    return fast && (await this.#waiting()) ? pollWhileWaitingMs : this.#every.inFrontMs;
  }

  async #scheduleIn(ms: number): Promise<void> {
    const at = new Date(this.#clock.now().getTime() + ms).toISOString();
    this.#dueAt = at;
    await this.#scheduler.schedule(this.#timer.key, this.#timer.timerId, at);
  }
}
