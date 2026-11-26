import type { Clock, Scheduler, SyncConnection } from "@halonicjs/ports";

/**
 * What one source's live events socket tells the sync, already cut down by the provider:
 * `change` for an event that touches the local copy, `resync` when the source says events were
 * dropped, and `closed` once. `refused` means the source won't let this key use the socket (a
 * 403, or a key it no longer accepts): trying again can't help until the key changes.
 */
export type EventsSignal =
  | { kind: "open" }
  | { kind: "change" }
  | { kind: "resync" }
  | { kind: "closed"; refused: boolean };

/** An open (or opening) socket, which the sync closes when it no longer wants it. */
export interface EventsSocket {
  close(): void;
}

/** Opens one socket and hands it the signals' listener; one call per attempt. */
export type OpenEvents = (onSignal: (signal: EventsSignal) => void) => EventsSocket;

/** The waits between two attempts, in milliseconds: 1, 2, 4 … seconds, at most a minute. */
export const reconnectWaits = { firstMs: 1_000, mostMs: 60_000 } as const;

/** How long a socket must stay open before the next drop starts the waits from 1 second again. */
export const reconnectResetAfterMs = 5 * 60_000;

/** What a {@link LiveEventsKeeper} needs. */
export interface LiveEventsKeeperOptions {
  scheduler: Scheduler;
  clock: Clock;
  /** The reconnect's timer, unique to this source. */
  timer: { key: string; timerId: string };
  open: OpenEvents;
  /** A number from 0 up to (not including) 1, for the waits' jitter; `Math.random` in the host. */
  random: () => number;
  /** Hears every signal of the socket that is current; never one of a socket it replaced. */
  onSignal: (signal: EventsSignal) => Promise<void>;
  /** Hears a failure to schedule the next attempt or to handle a signal; nothing is thrown. */
  report: (error: unknown) => void;
}

/**
 * Keeps one source's live events socket open (requirement `agent-host.paperclip-live-events`):
 * after a drop it opens a new one after a wait of 1, 2, 4 … up to 60 seconds, each with full
 * jitter, and starts from 1 second again once a socket stayed open 5 minutes. A refused socket
 * is not tried again: the source's state is `not-allowed` until a new key makes a new keeper.
 * Every wait is a timer on the {@link Scheduler} port.
 */
export class LiveEventsKeeper {
  readonly #options: LiveEventsKeeperOptions;
  #socket: EventsSocket | undefined;
  /** Counts the sockets opened, so a late signal of a replaced one is dropped. */
  #generation = 0;
  #attempt = 0;
  #openedAt: number | undefined;
  #state: SyncConnection = "polling-only";
  #stopped = false;

  constructor(options: LiveEventsKeeperOptions) {
    this.#options = options;
  }

  /** Whether events reach the sync now, or why not. */
  get state(): SyncConnection {
    return this.#state;
  }

  /** Opens the first socket. */
  start(): void {
    this.#connect();
  }

  /** Handles the reconnect's timer; `false` for any other, so the listener passes it on. */
  async onTimer(timer: { key: string; timerId: string }): Promise<boolean> {
    const own = this.#options.timer;
    if (timer.key !== own.key || timer.timerId !== own.timerId) return false;
    if (!this.#stopped && this.#socket === undefined) this.#connect();
    return true;
  }

  /** Closes the socket and cancels the next attempt; later signals are dropped. */
  async stop(): Promise<void> {
    this.#stopped = true;
    this.#generation += 1;
    const socket = this.#socket;
    this.#socket = undefined;
    socket?.close();
    await this.#options.scheduler.cancel(this.#options.timer.key, this.#options.timer.timerId);
  }

  #connect(): void {
    this.#generation += 1;
    const generation = this.#generation;
    this.#socket = this.#options.open((signal) => {
      if (generation !== this.#generation || this.#stopped) return;
      this.#heard(signal).catch(this.#options.report);
    });
  }

  async #heard(signal: EventsSignal): Promise<void> {
    if (signal.kind === "open") {
      this.#openedAt = this.#options.clock.now().getTime();
      this.#state = "connected";
    } else if (signal.kind === "closed") {
      await this.#closed(signal.refused);
    }
    await this.#options.onSignal(signal);
  }

  async #closed(refused: boolean): Promise<void> {
    this.#socket = undefined;
    this.#generation += 1;
    const now = this.#options.clock.now().getTime();
    if (this.#openedAt !== undefined && now - this.#openedAt >= reconnectResetAfterMs) {
      this.#attempt = 0;
    }
    this.#openedAt = undefined;
    if (refused) {
      this.#state = "not-allowed";
      return;
    }
    this.#state = "polling-only";
    const wait = Math.floor(this.#options.random() * waitCap(this.#attempt));
    this.#attempt += 1;
    const at = new Date(now + wait).toISOString();
    await this.#options.scheduler.schedule(
      this.#options.timer.key,
      this.#options.timer.timerId,
      at,
    );
  }
}

/** The longest wait before attempt `attempt` (from 0): 1 s doubled each time, at most 60 s. */
export function waitCap(attempt: number): number {
  return Math.min(reconnectWaits.mostMs, reconnectWaits.firstMs * 2 ** Math.min(attempt, 16));
}
