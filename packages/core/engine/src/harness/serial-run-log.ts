import type { RunEvent, RunEventBody } from "@halonicjs/events";
import type { Clock, RunStore } from "@halonicjs/ports";
import { readRun } from "../kernel/step.ts";
import type { HarnessEventLog } from "./run-harness-call.ts";

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
  readonly #callId: string;
  readonly #clock: Clock;
  #seq: number;
  /** The last append, which the next one waits for. */
  #tail: Promise<void> = Promise.resolve();

  /**
   * @param callId - the harness call that writes, which the run must still wait on
   * @param lastSeq - the `seq` of the run's last stored event, which the first event follows
   */
  constructor(
    store: Pick<RunStore, "append" | "events" | "snapshot">,
    runId: string,
    callId: string,
    lastSeq: number,
    clock: Clock,
  ) {
    this.#store = store;
    this.#runId = runId;
    this.#callId = callId;
    this.#seq = lastSeq;
    this.#clock = clock;
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
    return this.#tail.then(
      () => {},
      () => {},
    );
  }

  async #write(event: RunEventBody): Promise<void> {
    for (let attempt = 1; attempt <= maxAppendAttempts; attempt += 1) {
      const stored: RunEvent = {
        ...event,
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
    if (run?.pendingCall?.callId !== this.#callId) {
      throw new Error(
        `Run ${this.#runId} moved on from call ${this.#callId} while its harness wrote to the log.`,
      );
    }
    this.#seq = run.lastSeq;
  }
}
