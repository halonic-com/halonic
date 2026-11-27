import type { Clock, Scheduler } from "@halonicjs/ports";

/** The shortest time between two early notices for one source: each makes an open Messenger read again. */
export const noticeFloorMs = 1_000;

/** The timer that sends the notices a floor deferred. */
export const eventNoticeTimer = { key: "agent-messaging", timerId: "events-notice" } as const;

/** What an {@link EventNotice} needs. */
export interface EventNoticeOptions {
  scheduler: Scheduler;
  clock: Clock;
  /** Hears the sources to tell Studio about now. */
  tell: (ids: readonly string[]) => void;
  /** Hears a `tell` that threw; nothing is thrown. */
  report: (error: unknown) => void;
}

/**
 * The early notices of `agent-host.paperclip-event-notice`, at most one a {@link noticeFloorMs}
 * per source: a notice due sooner is deferred to the end of that second, never dropped, so the
 * last event of a steady stream is still told early. Every wait is a timer on the
 * {@link Scheduler} port.
 */
export class EventNotice {
  readonly #options: EventNoticeOptions;
  /** Per source, when it was last told, in milliseconds since 1970. */
  readonly #toldAt = new Map<string, number>();
  /** The sources with a notice deferred by the floor. */
  readonly #deferred = new Set<string>();

  constructor(options: EventNoticeOptions) {
    this.#options = options;
  }

  /** Tells `ids` now, or defers each one told less than {@link noticeFloorMs} ago. */
  async notice(ids: readonly string[]): Promise<void> {
    for (const id of ids) this.#deferred.add(id);
    await this.#tellDue();
  }

  /** Handles the deferred notices' timer; `false` for any other. */
  async onTimer(timer: { key: string; timerId: string }): Promise<boolean> {
    if (timer.key !== eventNoticeTimer.key || timer.timerId !== eventNoticeTimer.timerId) {
      return false;
    }
    await this.#tellDue();
    return true;
  }

  /** Forgets `id`, as Disconnect does: no deferred notice for it is sent. */
  forget(id: string): void {
    this.#toldAt.delete(id);
    this.#deferred.delete(id);
  }

  /** Cancels the deferred notices, when the host stops. */
  async stop(): Promise<void> {
    this.#deferred.clear();
    await this.#options.scheduler.cancel(eventNoticeTimer.key, eventNoticeTimer.timerId);
  }

  async #tellDue(): Promise<void> {
    const now = this.#options.clock.now().getTime();
    const due = [...this.#deferred].filter((id) => now >= this.#nextAt(id));
    for (const id of due) {
      this.#deferred.delete(id);
      this.#toldAt.set(id, now);
    }
    if (due.length > 0) this.#tell(due);
    if (this.#deferred.size === 0) return;
    const next = Math.min(...[...this.#deferred].map((id) => this.#nextAt(id)));
    const { key, timerId } = eventNoticeTimer;
    await this.#options.scheduler.schedule(key, timerId, new Date(next).toISOString());
  }

  #nextAt(id: string): number {
    const told = this.#toldAt.get(id);
    return told === undefined ? 0 : told + noticeFloorMs;
  }

  #tell(ids: readonly string[]): void {
    try {
      this.#options.tell(ids);
    } catch (error) {
      this.#options.report(error);
    }
  }
}
