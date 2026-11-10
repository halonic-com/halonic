import type { RunEvent, RunEventBody } from "@halonicjs/events";
import type { Clock, RunStore } from "@halonicjs/ports";
import { callOf } from "../kernel/run-state.ts";
import { readRun } from "../kernel/step.ts";
import type { HarnessEventLog } from "./run-harness-call.ts";

/**
 * The call id the run waits on for a harness call. It starts as the call's
 * own, and moves on to the next one each time a person answers an approval
 * the harness asked for.
 */
export interface WaitedOnCall {
  callId: string;
}

/** How often an append reads the run again after another writer got there first, before it gives up. */
export const maxAppendAttempts = 10;

/**
 * A {@link HarnessEventLog} that appends to a run's log in a {@link RunStore},
 * one event at a time in the order they were given. A harness call writes
 * from two places at once, the harness's stream and the bridge, so each
 * append waits for the one before it.
 *
 * The store accepts an event only if the log hasn't moved on, so no other
 * writer is overwritten. When another writer did move it on, the append
 * reads the run again: if the run still waits on this call, the event goes
 * after the other writer's; if it doesn't, the call has nothing left to
 * write to, and the append fails.
 */
export class SerialRunLog implements HarnessEventLog {
  readonly #store: Pick<RunStore, "append" | "events" | "snapshot">;
  readonly #runId: string;
  readonly #call: WaitedOnCall;
  readonly #clock: Clock;
  readonly #item: number | null;
  #seq: number;
  /** The last append, which the next one waits for. */
  #tail: Promise<void> = Promise.resolve();

  /**
   * @param call - the harness call that writes, which the run must still wait on
   * @param lastSeq - the `seq` of the run's last stored event, which the first event follows
   * @param item - the `foreach` item the call runs, which every event then carries; `null` for a task state's call
   */
  constructor(
    store: Pick<RunStore, "append" | "events" | "snapshot">,
    runId: string,
    call: WaitedOnCall,
    lastSeq: number,
    clock: Clock,
    item: number | null = null,
  ) {
    this.#store = store;
    this.#runId = runId;
    this.#call = call;
    this.#seq = lastSeq;
    this.#clock = clock;
    this.#item = item;
  }

  /**
   * Appends one event after every event given before it.
   *
   * @throws when the run no longer waits on the call, the log kept moving on
   *   for {@link maxAppendAttempts} reads, or an earlier append failed
   */
  append(event: RunEventBody): Promise<void> {
    const appended = this.#tail.then(() => this.#write(event));
    this.#tail = appended;
    return appended;
  }

  settled(): Promise<void> {
    return this.#tail.then(ignore, ignore);
  }

  /**
   * Runs `work` after every append given so far, and holds the appends given
   * meanwhile until it settles. When an earlier append failed, those fail
   * as they would without the hold.
   */
  whileHeld<T>(work: () => Promise<T>): Promise<T> {
    const held = this.settled().then(work);
    this.#tail = this.#tail.then(() => held.then(ignore, ignore));
    return held;
  }

  async #write(event: RunEventBody): Promise<void> {
    for (let attempt = 1; attempt <= maxAppendAttempts; attempt += 1) {
      const stored: RunEvent = {
        ...event,
        ...(this.#item === null ? {} : { item: this.#item }),
        runId: this.#runId,
        seq: this.#seq + 1,
        at: this.#clock.now().toISOString(),
      };
      const result = await this.#store.append(this.#runId, this.#seq, [stored]);
      if (result.ok) {
        this.#seq = result.lastSeq;
        return;
      }
      await this.#catchUp();
    }
    throw new Error(
      `The log of run ${this.#runId} kept moving on while a harness wrote to it; gave up after ${maxAppendAttempts} tries.`,
    );
  }

  /**
   * Follows the log to its last event, after another writer added to it.
   *
   * @throws when the run no longer waits on this call
   */
  async #catchUp(): Promise<void> {
    const run = await readRun(this.#store, this.#runId);
    const { callId } = this.#call;
    if (run === null || callOf(run, callId) === null) {
      throw new Error(
        `Run ${this.#runId} moved on from call ${callId} while its harness wrote to the log.`,
      );
    }
    this.#seq = run.lastSeq;
  }
}

/** Settles a promise's chain without its value or error. */
function ignore(): void {}
