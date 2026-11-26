// One run in one worker thread, and the parent's side of its limits
// (ADR 2.2 and 2.3). The worker starts with no env, argv, execArgv or
// workerData; its message port is the only channel. The parent's timers
// start when the worker says `started`, and the parent terminates the
// worker on every way out, so no worker outlives its run.

import { Worker, type WorkerOptions } from "node:worker_threads";
import type { ToolScriptIsolateResult, ToolScriptLimits } from "@halonicjs/ports";
import { checkedResult, failedRun, startedMessage, type WorkerRequest } from "./worker-messages.ts";

/**
 * How long past its CPU limit a worker may run before the parent kills it.
 * The isolate's own interrupt check stops a busy script at the limit; this
 * catches a long native operation that never reaches that check (ADR 2.3).
 */
export const workerKillGraceMs = 500;

/** How long a new worker has to say `started` before the parent gives up on it. */
export const workerStartLimitMs = 10_000;

/**
 * The worker's own V8 heap. The isolate's memory is WASM memory of a fixed
 * size outside it (HAL-17780), so this only bounds the glue code.
 */
export const workerResourceLimits = {
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  stackSizeMb: 4,
} as const;

/** Starts a worker; tests count the starts. */
export type StartWorker = (entry: URL, options: WorkerOptions) => Worker;

/** Node's own `new Worker`. */
export const startWorker: StartWorker = (entry, options) => new Worker(entry, options);

/** Where and how a run's worker starts. */
export interface WorkerPlace {
  /** The worker's code: `worker-entry.ts`, or a test's stand-in. */
  readonly entry: URL;
  readonly startWorker: StartWorker;
  /** How long a worker has to say `started`; {@link workerStartLimitMs} outside tests. */
  readonly startLimitMs: number;
}

/**
 * Runs `request` in a new worker at `place` and terminates it once the run
 * has a result: the worker's, checked by the parent, or the parent's own
 * when the worker overran its CPU limit plus {@link workerKillGraceMs}
 * (`limit.cpu`) or its wall clock (`limit.wall-clock`), `signal` aborted
 * (`toolscript.cancelled`), or the worker crashed, exited or never started
 * (`toolscript.failed`).
 */
export function runInWorker(
  place: WorkerPlace,
  request: WorkerRequest,
  signal?: AbortSignal,
): Promise<ToolScriptIsolateResult> {
  // Cancelled while it waited for its turn: no worker starts.
  if (signal?.aborted) return Promise.resolve(failedRun("toolscript.cancelled", request.limits));
  return new Promise((resolve) => {
    const worker = place.startWorker(place.entry, {
      env: {},
      argv: [],
      // Otherwise the worker inherits the parent's flags, such as --inspect or --conditions.
      execArgv: [],
      resourceLimits: workerResourceLimits,
    });
    new WorkerRun(worker, request.limits, place.startLimitMs, signal, resolve).start(request);
  });
}

/** The parent's watch over one worker, from its start to its one result. */
class WorkerRun {
  readonly #worker: Worker;
  readonly #limits: ToolScriptLimits;
  readonly #signal: AbortSignal | undefined;
  readonly #resolve: (result: ToolScriptIsolateResult) => void;
  readonly #timers: ReturnType<typeof setTimeout>[] = [];
  #started = false;
  #done = false;

  constructor(
    worker: Worker,
    limits: ToolScriptLimits,
    startLimitMs: number,
    signal: AbortSignal | undefined,
    resolve: (result: ToolScriptIsolateResult) => void,
  ) {
    this.#worker = worker;
    this.#limits = limits;
    this.#signal = signal;
    this.#resolve = resolve;
    this.#after(startLimitMs, "toolscript.failed");
  }

  start(request: WorkerRequest): void {
    this.#worker.on("message", this.#heard);
    this.#worker.on("error", this.#stopped);
    this.#worker.once("exit", this.#stopped);
    this.#signal?.addEventListener("abort", this.#cancelled, { once: true });
    this.#worker.postMessage(request);
  }

  readonly #heard = (message: unknown): void => {
    if (this.#started) {
      this.#finish(checkedResult(message, this.#limits));
      return;
    }
    // Anything before `started` breaks the protocol.
    if (message !== startedMessage) {
      this.#finish(failedRun("toolscript.failed", this.#limits));
      return;
    }
    this.#started = true;
    this.#clearTimers();
    this.#after(this.#limits.cpuMs + workerKillGraceMs, "limit.cpu");
    if (this.#limits.wallClockMs !== null)
      this.#after(this.#limits.wallClockMs, "limit.wall-clock");
  };

  /** A crash or an exit without a result; never the error's text, which may hold a stack (S13). */
  readonly #stopped = (): void => {
    this.#finish(
      failedRun("toolscript.failed", this.#limits, "The run's worker stopped without a result."),
    );
  };

  readonly #cancelled = (): void => {
    this.#finish(failedRun("toolscript.cancelled", this.#limits));
  };

  #after(ms: number, reason: "toolscript.failed" | "limit.cpu" | "limit.wall-clock"): void {
    this.#timers.push(setTimeout(() => this.#finish(failedRun(reason, this.#limits)), ms));
  }

  #finish(result: ToolScriptIsolateResult): void {
    if (this.#done) return;
    this.#done = true;
    this.#clearTimers();
    this.#signal?.removeEventListener("abort", this.#cancelled);
    this.#worker.off("message", this.#heard);
    // The result is final now; terminate() ends the thread whatever it is doing.
    void this.#worker.terminate();
    this.#resolve(result);
  }

  #clearTimers(): void {
    for (const timer of this.#timers.splice(0)) clearTimeout(timer);
  }
}
