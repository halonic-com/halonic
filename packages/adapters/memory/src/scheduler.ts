import type {
  Clock,
  ScheduledTimer,
  Scheduler,
  SchedulerFactory,
  SchedulerListener,
} from "@halonicjs/ports";

const maxIdBytes = 256;
const tickEveryMs = 60_000;
const firstRetryMs = 1000;
const maxRetryMs = 15 * 60_000;

/** Options for {@link MemoryScheduler}. */
export interface MemorySchedulerOptions {
  /**
   * Delivers every timer a second time after the first call resolves, as a
   * real platform may (multi-cloud ADR 5.3). Kernel tests use it to prove the
   * listener ignores a timer it has already handled.
   */
  duplicateDeliveries?: boolean;
}

interface StoredTimer {
  timer: ScheduledTimer;
  /** When it is next delivered, in ms: the set time, or a retry time after a failure. */
  dueAt: number;
  failures: number;
  /** Changes on every `schedule` and `cancel`, so a delivery can tell that the timer was set again while it ran. */
  version: number;
}

/**
 * Timers in a map, delivered when the owner calls {@link MemoryScheduler.runDue}.
 * Nothing runs on its own: the kernel tests and the parity harness decide
 * when time passes, and the browser demo calls `runDue` from its own timer.
 */
export class MemoryScheduler implements Scheduler {
  readonly #timers = new Map<string, StoredTimer>();
  /** The timers whose `onTimer` call is running now, by slot. */
  readonly #delivering = new Set<string>();
  readonly #listener: SchedulerListener;
  readonly #clock: Clock;
  readonly #duplicates: boolean;
  #version = 0;
  #lastTick: number;

  constructor(listener: SchedulerListener, clock: Clock, options: MemorySchedulerOptions = {}) {
    this.#listener = listener;
    this.#clock = clock;
    this.#duplicates = options.duplicateDeliveries ?? false;
    this.#lastTick = clock.now().getTime();
  }

  async schedule(key: string, timerId: string, at: string): Promise<void> {
    checkId("key", key);
    checkId("timer id", timerId);
    const dueAt = Date.parse(at);
    if (Number.isNaN(dueAt)) {
      throw new RangeError(`Timer time ${JSON.stringify(at)} is not a valid time.`);
    }
    this.#version += 1;
    this.#timers.set(slot(key, timerId), {
      timer: { key, timerId, at },
      dueAt,
      failures: 0,
      version: this.#version,
    });
  }

  async cancel(key: string, timerId: string): Promise<void> {
    this.#version += 1;
    this.#timers.delete(slot(key, timerId));
  }

  async pending(key: string): Promise<ScheduledTimer[]> {
    return [...this.#timers.values()]
      .filter((stored) => stored.timer.key === key)
      .map((stored) => ({ ...stored.timer }))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.timerId < b.timerId ? -1 : 1));
  }

  /**
   * Delivers every timer due by the clock now, earliest first and one at a
   * time, then the routine tick when a minute has passed since the last one.
   * A timer set during this call to a time already past waits for the next call.
   *
   * It may be called again while an earlier call still waits on a slow
   * `onTimer`, as time passes: that call delivers the other due timers and
   * skips the ones still being delivered, as the port asks.
   */
  async runDue(): Promise<void> {
    const now = this.#clock.now().getTime();
    const due = [...this.#timers.entries()]
      .filter(([id, stored]) => stored.dueAt <= now && !this.#delivering.has(id))
      .sort(([, a], [, b]) => a.dueAt - b.dueAt);
    for (const [id, stored] of due) {
      if (this.#timers.get(id)?.version === stored.version) {
        await this.#deliver(id, stored);
      }
    }
    if (now - this.#lastTick >= tickEveryMs) {
      this.#lastTick = now;
      await this.#listener.onTick(new Date(now).toISOString()).catch(() => {});
    }
  }

  async #deliver(id: string, stored: StoredTimer): Promise<void> {
    this.#delivering.add(id);
    try {
      await this.#callListener(id, stored);
    } finally {
      this.#delivering.delete(id);
    }
  }

  /** Calls the listener, then removes the timer, or sets its retry when the call rejects. */
  async #callListener(id: string, stored: StoredTimer): Promise<void> {
    try {
      await this.#listener.onTimer({ ...stored.timer });
    } catch {
      if (this.#timers.get(id)?.version === stored.version) {
        stored.failures += 1;
        stored.dueAt = this.#clock.now().getTime() + retryWait(stored.failures);
      }
      return;
    }
    if (this.#timers.get(id)?.version === stored.version) {
      this.#timers.delete(id);
      if (this.#duplicates) {
        await this.#listener.onTimer({ ...stored.timer }).catch(() => {});
      }
    }
  }
}

/** A {@link SchedulerFactory} for memory schedulers that read `clock`. */
export function memorySchedulerFactory(
  clock: Clock,
  options: MemorySchedulerOptions = {},
): SchedulerFactory {
  return (listener) => new MemoryScheduler(listener, clock, options);
}

/** 1 second after the first failure, doubling, at most 15 minutes (the port's retry rule). */
function retryWait(failures: number): number {
  return Math.min(firstRetryMs * 2 ** (failures - 1), maxRetryMs);
}

function checkId(what: string, value: string): void {
  if (new TextEncoder().encode(value).byteLength > maxIdBytes) {
    throw new RangeError(`A timer ${what} is at most ${maxIdBytes} UTF-8 bytes.`);
  }
}

/** One map key per key and timer id; JSON keeps `a` + `b/c` apart from `a/b` + `c`. */
function slot(key: string, timerId: string): string {
  return JSON.stringify([key, timerId]);
}
