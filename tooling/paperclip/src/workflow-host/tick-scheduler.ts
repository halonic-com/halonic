import type { Clock, ScheduledTimer, Scheduler, SchedulerListener } from "@halonicjs/ports";
import type { ScopeKey } from "@paperclipai/plugin-sdk";
import type { RunStateClient } from "./plugin-run-store.ts";

/**
 * Run timers in plugin state (HAL-17774), delivered when the plugin's job
 * tick calls {@link TickScheduler.runDue}. Nothing runs on its own between
 * ticks, so a timer arrives up to one tick late (Liam, HAL-17772: a 1 to 5
 * minute tick is close enough for `after: 15m`). The timers survive a
 * restart of the worker; which deliveries are in progress is the worker's
 * own, as only the holder of the engine lock opens a scheduler.
 */

const maxIdBytes = 256;
const tickEveryMs = 60_000;
const firstRetryMs = 1000;
const maxRetryMs = 15 * 60_000;

interface StoredTimer {
  readonly timer: ScheduledTimer;
  /** When it is next delivered, in ms: the set time, or a retry time after a failure. */
  readonly dueAt: number;
  readonly failures: number;
  /** Changes on every `schedule` and `cancel`, so a delivery can tell that the timer was set again while it ran. */
  readonly version: number;
}

/** The one state entry: every timer by slot, the last version handed out and the last tick. */
interface TimerTable {
  readonly timers: Readonly<Record<string, StoredTimer>>;
  readonly version: number;
  readonly lastTick: number | null;
}

const emptyTable: TimerTable = { timers: {}, version: 0, lastTick: null };

/** Where a company's run timers live in plugin state. */
export const workflowTimersNamespace = "workflow-timers";

export class TickScheduler implements Scheduler {
  readonly #state: RunStateClient;
  readonly #key: ScopeKey;
  readonly #listener: SchedulerListener;
  readonly #clock: Clock;
  /** The timers whose `onTimer` call is running now, by slot. */
  readonly #delivering = new Set<string>();
  /** The end of the last change to the table, so changes run one after the other. */
  #turn: Promise<unknown> = Promise.resolve();

  constructor(state: RunStateClient, companyId: string, listener: SchedulerListener, clock: Clock) {
    this.#state = state;
    this.#key = {
      scopeKind: "company",
      scopeId: companyId,
      namespace: workflowTimersNamespace,
      stateKey: "timers",
    };
    this.#listener = listener;
    this.#clock = clock;
  }

  async #read(): Promise<TimerTable> {
    return ((await this.#state.get(this.#key)) as TimerTable | null) ?? emptyTable;
  }

  /** Reads, changes and writes the table after every change before it. */
  #change<T>(work: (table: TimerTable) => { table: TimerTable | null; result: T }): Promise<T> {
    const step = async () => {
      const { table, result } = work(await this.#read());
      if (table !== null) {
        await this.#state.set(this.#key, table);
      }
      return result;
    };
    const done = this.#turn.then(step, step);
    this.#turn = done.catch(() => {});
    return done;
  }

  async schedule(key: string, timerId: string, at: string): Promise<void> {
    checkId("key", key);
    checkId("timer id", timerId);
    const dueAt = Date.parse(at);
    if (Number.isNaN(dueAt)) {
      throw new RangeError(`Timer time ${JSON.stringify(at)} is not a valid time.`);
    }
    await this.#change((table) => {
      const version = table.version + 1;
      const stored = { timer: { key, timerId, at }, dueAt, failures: 0, version };
      const timers = { ...table.timers, [slot(key, timerId)]: stored };
      return { table: { ...table, timers, version }, result: undefined };
    });
  }

  cancel(key: string, timerId: string): Promise<void> {
    return this.#change((table) => {
      const { [slot(key, timerId)]: _gone, ...timers } = table.timers;
      return { table: { ...table, timers, version: table.version + 1 }, result: undefined };
    });
  }

  async pending(key: string): Promise<ScheduledTimer[]> {
    const { timers } = await this.#read();
    return Object.values(timers)
      .filter((stored) => stored.timer.key === key)
      .map((stored) => ({ ...stored.timer }))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.timerId < b.timerId ? -1 : 1));
  }

  /**
   * Delivers every timer due by the clock now, earliest first and one at a
   * time, then the routine tick when a minute has passed since the last one.
   * The plugin's job tick calls it. A call while an earlier one still waits on
   * a slow `onTimer` delivers the other due timers and skips that one.
   *
   * @returns how many timers it delivered, so a caller can deliver again until none is due
   */
  async runDue(): Promise<number> {
    const now = this.#clock.now().getTime();
    const table = await this.#read();
    const due = Object.entries(table.timers)
      .filter(([id, stored]) => stored.dueAt <= now && !this.#delivering.has(id))
      .sort(([, a], [, b]) => a.dueAt - b.dueAt);
    let delivered = 0;
    for (const [id, stored] of due) {
      const current = (await this.#read()).timers[id];
      if (current?.version === stored.version) {
        await this.#deliver(id, stored);
        delivered += 1;
      }
    }
    const ticked = await this.#change((latest) => {
      const tickDue = latest.lastTick === null || now - latest.lastTick >= tickEveryMs;
      return { table: tickDue ? { ...latest, lastTick: now } : null, result: tickDue };
    });
    if (ticked) {
      await this.#listener.onTick(new Date(now).toISOString()).catch(() => {});
    }
    return delivered;
  }

  async #deliver(id: string, stored: StoredTimer): Promise<void> {
    this.#delivering.add(id);
    try {
      let failed = false;
      try {
        await this.#listener.onTimer({ ...stored.timer });
      } catch {
        failed = true;
      }
      await this.#change((table) => {
        const current = table.timers[id];
        // Set again or cancelled while it ran: the new setting stands.
        if (current?.version !== stored.version) {
          return { table: null, result: undefined };
        }
        const { [id]: _done, ...rest } = table.timers;
        const failures = current.failures + 1;
        const retry = {
          ...current,
          failures,
          dueAt: this.#clock.now().getTime() + retryWait(failures),
        };
        const timers = failed ? { ...rest, [id]: retry } : rest;
        return { table: { ...table, timers }, result: undefined };
      });
    } finally {
      this.#delivering.delete(id);
    }
  }

  /** Nothing to stop: no timer of its own runs. Waits for the last change to land. */
  async close(): Promise<void> {
    await this.#turn;
  }
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

/** One table key per key and timer id; JSON keeps `a` + `b/c` apart from `a/b` + `c`. */
function slot(key: string, timerId: string): string {
  return JSON.stringify([key, timerId]);
}
