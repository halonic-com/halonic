import type {
  Clock,
  ScheduledTimer,
  Scheduler,
  SyncConnection,
  SyncSource,
} from "@halonicjs/ports";
import { type EventsSignal, LiveEventsKeeper, type OpenEvents } from "./live-events-keeper.ts";
import type { EventsState } from "./poll-rates.ts";
import type { SyncCounters } from "./sync-counters.ts";
import type { SyncScheduler } from "./sync-scheduler.ts";

/** The timer that ends a batch of events, and the key every source's reconnect timer shares. */
export const liveSyncTimers = {
  batch: { key: "agent-messaging", timerId: "events-batch" },
  reconnectKey: "live-events",
} as const;

/** How long events are gathered before they bring one read: a burst of ten makes one, not ten. */
export const eventsBatchMs = 300;

/** What a {@link LiveSync} needs. */
export interface LiveSyncOptions {
  scheduler: Scheduler;
  clock: Clock;
  /** The poll that events bring forward, and that hears whether events reach the engine. */
  sync: Pick<SyncScheduler, "pollNow" | "setEvents">;
  /** Hears whether events reach the engine, for diagnostics. */
  counters?: Pick<SyncCounters, "setConnection">;
  /** Hears a failure of a socket's timer or of the poll a signal brings; nothing is thrown. */
  report: (error: unknown) => void;
  /** For the reconnect waits' jitter; `Math.random` by default. */
  random?: () => number;
}

/**
 * Every connected source's live events, joined to the sync (requirement
 * `agent-host.paperclip-live-events`). An event that touches a local copy brings a read
 * {@link eventsBatchMs} later, gathering the ones that follow, and so does a `resync`, so a server
 * that repeats it can't bring reads back to back; a (re)connect reads at once, since events can't
 * be replayed. Adding and removing a source run one at a time per source. Events count as
 * connected only while every source's socket is open; otherwise the sync polls at the rates
 * without events. Each change a read then applies is counted by how it was announced: `event`,
 * `catch-up`, or `poll` when nothing announced it, which the counters call missed by events while
 * they were connected.
 */
export class LiveSync {
  readonly #options: LiveSyncOptions;
  readonly #random: () => number;
  readonly #keepers = new Map<string, LiveEventsKeeper>();
  /** Per source, what announced the changes the next read will find, and when (by {@link #heardCount}). */
  readonly #announced = new Map<string, { source: SyncSource; heard: number }>();
  #heardCount = 0;
  #batching = false;
  /** Per source, the add or remove still running, which the next one waits for. */
  readonly #changing = new Map<string, Promise<void>>();
  #combined: SyncConnection = "polling-only";
  #stopped = false;

  constructor(options: LiveSyncOptions) {
    this.#options = options;
    this.#random = options.random ?? Math.random;
  }

  /**
   * Starts following `id`'s events, replacing the socket it had: a new key always comes with a
   * new socket, so a source refused before is tried again.
   */
  add(id: string, open: OpenEvents): Promise<void> {
    return this.#oneAtATime(id, () => this.#add(id, open));
  }

  /** Stops following `id`'s events, as Disconnect does. */
  remove(id: string): Promise<void> {
    return this.#oneAtATime(id, () => this.#remove(id));
  }

  async #add(id: string, open: OpenEvents): Promise<void> {
    await this.#keepers.get(id)?.stop();
    // Once the host stops, no source opens a socket again.
    if (this.#stopped) return;
    const keeper = new LiveEventsKeeper({
      scheduler: this.#options.scheduler,
      clock: this.#options.clock,
      timer: { key: liveSyncTimers.reconnectKey, timerId: id },
      open,
      random: this.#random,
      onSignal: (signal) => this.#heard(id, signal),
      report: this.#options.report,
    });
    this.#keepers.set(id, keeper);
    keeper.start();
    await this.#combine();
  }

  async #remove(id: string): Promise<void> {
    const keeper = this.#keepers.get(id);
    this.#keepers.delete(id);
    this.#announced.delete(id);
    await keeper?.stop();
    await this.#combine();
  }

  /**
   * Runs `work` once every add or remove of `id` before it ended, so two that overlap can't both
   * replace the same keeper and leave one socket open. A failed one doesn't stop the next.
   */
  async #oneAtATime(id: string, work: () => Promise<void>): Promise<void> {
    const before = this.#changing.get(id) ?? Promise.resolve();
    const running = before.catch(() => undefined).then(work);
    this.#changing.set(id, running);
    try {
      await running;
    } finally {
      if (this.#changing.get(id) === running) this.#changing.delete(id);
    }
  }

  /**
   * The counters for `id`'s local copy: a change a poll applies is counted as an `event` or a
   * `catch-up` when one announced it since the read before.
   */
  countersFor(id: string, counters: Pick<SyncCounters, "applied">): Pick<SyncCounters, "applied"> {
    return {
      applied: (source, asOf) => {
        const announced = source === "poll" ? this.#announced.get(id)?.source : undefined;
        counters.applied(announced ?? source, asOf);
      },
    };
  }

  /**
   * Runs one read of every source, then forgets what announced the changes it found. First it sets
   * again each reconnect whose timer couldn't be set, so no source stays without a next attempt.
   */
  async poll(read: () => Promise<void>): Promise<void> {
    for (const keeper of this.#keepers.values()) await keeper.retrySchedule();
    const before = this.#heardCount;
    try {
      await read();
    } finally {
      for (const [id, announced] of this.#announced) {
        if (announced.heard <= before) this.#announced.delete(id);
      }
    }
  }

  /** Handles the batch's timer and each source's reconnect timer; `false` for any other. */
  async onTimer(timer: ScheduledTimer): Promise<boolean> {
    const batch = liveSyncTimers.batch;
    if (timer.key === batch.key && timer.timerId === batch.timerId) {
      this.#batching = false;
      await this.#options.sync.pollNow();
      return true;
    }
    if (timer.key !== liveSyncTimers.reconnectKey) return false;
    await this.#keepers.get(timer.timerId)?.onTimer(timer);
    return true;
  }

  /**
   * Closes every socket and cancels their timers, when the host stops. It waits for every add and
   * remove still running first, so none opens a socket after it.
   */
  async stop(): Promise<void> {
    this.#stopped = true;
    await Promise.all([...this.#changing.values()].map((change) => change.catch(() => undefined)));
    const keepers = [...this.#keepers.values()];
    this.#keepers.clear();
    await Promise.all(keepers.map((keeper) => keeper.stop()));
    const batch = liveSyncTimers.batch;
    await this.#options.scheduler.cancel(batch.key, batch.timerId);
  }

  async #heard(id: string, signal: EventsSignal): Promise<void> {
    switch (signal.kind) {
      case "change":
        this.#announce(id, "event");
        await this.#batch();
        return;
      case "resync":
        this.#announce(id, "catch-up");
        await this.#batch();
        return;
      case "open":
        // A read at once catches up on what happened while the socket was down.
        this.#announce(id, "catch-up");
        await this.#combine();
        await this.#options.sync.pollNow();
        return;
      default:
        await this.#combine();
    }
  }

  #announce(id: string, source: SyncSource): void {
    this.#heardCount += 1;
    const known = this.#announced.get(id)?.source;
    // A catch-up read covers everything, so it isn't downgraded by an event that follows.
    this.#announced.set(id, {
      source: known === "catch-up" ? known : source,
      heard: this.#heardCount,
    });
  }

  async #batch(): Promise<void> {
    if (this.#batching) return;
    this.#batching = true;
    const { key, timerId } = liveSyncTimers.batch;
    const at = new Date(this.#options.clock.now().getTime() + eventsBatchMs).toISOString();
    try {
      await this.#options.scheduler.schedule(key, timerId, at);
    } catch (error) {
      // No timer is set, so the next event must be able to set one.
      this.#batching = false;
      throw error;
    }
  }

  /** Tells the sync and the counters whether every source's events reach the engine. */
  async #combine(): Promise<void> {
    const combined = combinedState([...this.#keepers.values()].map((keeper) => keeper.state));
    if (combined === this.#combined) return;
    this.#combined = combined;
    this.#options.counters?.setConnection(combined);
    const events: EventsState = combined === "connected" ? "connected" : "down";
    await this.#options.sync.setEvents(events);
  }
}

/**
 * All sources' state as one: `connected` only when every source is, `not-allowed` when every one
 * that isn't connected is refused, and `polling-only` otherwise, also with no source at all.
 */
export function combinedState(states: readonly SyncConnection[]): SyncConnection {
  if (states.length === 0) return "polling-only";
  if (states.every((state) => state === "connected")) return "connected";
  const notConnected = states.filter((state) => state !== "connected");
  return notConnected.every((state) => state === "not-allowed") ? "not-allowed" : "polling-only";
}
