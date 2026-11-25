import type { Clock, ScheduledTimer, Scheduler } from "@halonicjs/ports";

/** How often the providers are read while Studio's window is in front. */
export const pollInFrontMs = 30_000;
/** How often the providers are read while Studio's window is in the background. */
export const pollInBackgroundMs = 5 * 60_000;

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
}

/**
 * Reads the messaging providers on a schedule (requirement
 * `agent-host.paperclip-polling`): about every 30 seconds while Studio's
 * window is in front, every 5 minutes in the background, and at once when it
 * comes back to the front. Every wait is a timer on the {@link Scheduler}
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
  #inFront = true;
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
  }

  /** Starts polling, with Studio's window in front unless told otherwise. */
  async start(inFront = true): Promise<void> {
    this.#inFront = inFront;
    await this.#scheduleIn(this.#interval());
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
   * Handles a scheduler timer. Returns `false` for a timer that isn't the
   * poll's, so the host's listener passes it on.
   */
  async onTimer(timer: ScheduledTimer): Promise<boolean> {
    if (timer.key !== this.#timer.key || timer.timerId !== this.#timer.timerId) return false;
    if (timer.at !== this.#dueAt) return true;
    await this.#poll();
    // The next wait starts after this poll, unless the window came to the front meanwhile.
    if (this.#dueAt === timer.at) await this.#scheduleIn(this.#interval());
    return true;
  }

  /** Stops polling: the timer is removed and later deliveries are dropped. */
  async stop(): Promise<void> {
    this.#dueAt = undefined;
    await this.#scheduler.cancel(this.#timer.key, this.#timer.timerId);
  }

  #interval(): number {
    return this.#inFront ? this.#every.inFrontMs : this.#every.inBackgroundMs;
  }

  async #scheduleIn(ms: number): Promise<void> {
    const at = new Date(this.#clock.now().getTime() + ms).toISOString();
    this.#dueAt = at;
    await this.#scheduler.schedule(this.#timer.key, this.#timer.timerId, at);
  }
}
