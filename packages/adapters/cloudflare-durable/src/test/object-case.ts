/**
 * What a test Durable Object keeps of the suite case it belongs to. Each object runs in an isolate
 * of its own, often in another colo, so nothing here may live in the suite's isolate:
 *
 * - The clock is a time in the object's own storage (the sync KV of its SQLite storage, so
 *   `clock.now()` stays synchronous). The suite sets it over RPC with {@link CaseObject.setCase}.
 * - The listener and the run list sink are the suite's, reached through `hooks`, an RPC stub the
 *   object keeps in memory. The suite hands over a new one with every `setCase`, and the object
 *   holds on to it with `dup()`: the stub it was given is disposed when that call returns.
 *
 * Test code only: never import it from a runtime bundle.
 */

import type { RunSummary } from "@halonicjs/events";
import type { ScheduledTimer, SchedulerListener } from "@halonicjs/ports";
import type { Clock } from "@halonicjs/std";
import type { RunListSink } from "../run-state.ts";

/** What the suite answers for its case: the listener's calls and the run list's. */
export interface CaseHooks extends SchedulerListener, RunListSink, Rpc.RpcTargetBranded {
  onTimer(timer: ScheduledTimer): Promise<void>;
  onTick(at: string): Promise<void>;
  publish(summary: RunSummary, seq: number): Promise<void>;
}

/** A hooks stub as an object receives it over RPC. */
export type CaseHooksStub = Rpc.Stub<CaseHooks>;

/** What every test object offers the suite, whatever its class. */
export interface CaseObject {
  /** Sets the time the object reads, and where it sends what it reports. Wakes a waiting `nap`. */
  setCase(clockMs: number, hooks: CaseHooks): Promise<void>;
}

const clockKey = "test:clock-ms";

/** The case state of one test object. */
export class ObjectCaseControl {
  readonly #storage: DurableObjectStorage;
  readonly #wakers = new Set<() => void>();
  #hooks: CaseHooksStub | undefined;

  constructor(storage: DurableObjectStorage) {
    this.#storage = storage;
  }

  /** The time the suite set, frozen until it sets another. */
  readonly clock: Clock = {
    now: () => {
      const ms = this.#storage.kv.get<number>(clockKey);
      if (ms === undefined) throw new Error("The suite has not set this test object's clock.");
      return new Date(ms);
    },
  };

  setCase(clockMs: number, hooks: CaseHooksStub): void {
    this.#storage.kv.put(clockKey, clockMs);
    this.#hooks?.[Symbol.dispose]();
    this.#hooks = hooks.dup();
    for (const wake of this.#wakers) wake();
  }

  /** Resolves when the clock is next set, or when `signal` aborts: how a test object naps. */
  nextMove(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const wake = () => {
        this.#wakers.delete(wake);
        resolve();
      };
      this.#wakers.add(wake);
      signal.addEventListener("abort", wake);
    });
  }

  /** The suite's listener and run list: only there once the suite has called `setCase`. */
  get hooks(): CaseHooksStub {
    if (this.#hooks === undefined) {
      throw new Error("The suite has not given this test object its hooks.");
    }
    return this.#hooks;
  }
}
