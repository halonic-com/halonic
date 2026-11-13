import { DurableObject } from "cloudflare:workers";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import type {
  AppendOptions,
  AppendResult,
  RunSnapshot,
  ScheduledTimer,
  SchedulerListener,
} from "@halonicjs/ports";
import { type Clock, systemClock } from "@halonicjs/std";
import type { RunHealth, RunObjectApi } from "./run-object-api.ts";
import { sqlOfStorage } from "./run-sql.ts";
import { type RunListSink, RunState } from "./run-state.ts";
import { napFor } from "./timer-delivery.ts";

/**
 * The Durable Object of one run: its event log and its timers, in the
 * object's own SQLite storage. It does nothing itself: each method is a
 * method of {@link RunState}, and callers use them through `DurableScheduler`
 * and `DurableRunStore`.
 *
 * The Worker subclasses it and overrides {@link RunObject.timerListener} and
 * {@link RunObject.runList}: the platform wakes the object at the alarm, and the
 * object has no engine or database of its own to call.
 *
 * Never rename or delete this class once it has been deployed: Cloudflare
 * deletes a Durable Object class's data with it. The names are fixed in
 * `durableObjectClassNames` and in the package README.
 */
export class RunObject extends DurableObject implements RunObjectApi {
  /** The time timers are due by. Only a test replaces it. */
  protected clock: Clock = systemClock;
  /** How the delivery loop waits for the next timer. Only a test replaces it. */
  protected nap = napFor;
  readonly #state: RunState;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    // Read through `this` on every call, so a subclass's clock, nap and listener count.
    this.#state = new RunState({
      sql: sqlOfStorage(ctx.storage),
      alarm: {
        set: (atMs) => ctx.storage.setAlarm(atMs),
        clear: () => ctx.storage.deleteAlarm(),
      },
      clock: () => this.clock,
      nap: (ms, signal) => this.nap(ms, signal),
      listener: () => this.timerListener(),
      runList: () => this.runList(),
    });
  }

  /** Who is called when a timer is due. The Worker's subclass answers with its engine's listener. */
  protected timerListener(): Pick<SchedulerListener, "onTimer"> {
    throw new Error(
      "This RunObject has no timer listener: subclass it and override timerListener().",
    );
  }

  /** Where run summaries go for the run list. The Worker's subclass answers with a `D1RunList`. */
  protected runList(): RunListSink {
    throw new Error("This RunObject has no run list: subclass it and override runList().");
  }

  append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options?: AppendOptions,
  ): Promise<AppendResult> {
    return this.#state.append(runId, expectedSeq, events, options);
  }

  events(afterSeq?: number): Promise<RunEvent[]> {
    return this.#state.events(afterSeq);
  }

  snapshot(): Promise<RunSnapshot | null> {
    return this.#state.snapshot();
  }

  summary(): Promise<RunSummary | null> {
    return this.#state.summary();
  }

  health(): Promise<RunHealth> {
    return this.#state.health();
  }

  schedule(key: string, timerId: string, at: string): Promise<void> {
    return this.#state.schedule(key, timerId, at);
  }

  cancel(key: string, timerId: string): Promise<void> {
    return this.#state.cancel(key, timerId);
  }

  pending(key: string): Promise<ScheduledTimer[]> {
    return this.#state.pending(key);
  }

  /** Cloudflare calls this at the alarm time, and never twice at once. */
  override alarm(): Promise<void> {
    return this.#state.alarm();
  }
}
