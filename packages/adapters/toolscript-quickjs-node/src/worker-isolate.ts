import { availableParallelism } from "node:os";
import {
  effectiveToolScriptLimits,
  type ToolScriptIsolate,
  type ToolScriptLimits,
  toolScriptDefaultLimits,
} from "@halonicjs/ports";
import { refusalOf } from "./plain-input.ts";
import { failedRun } from "./worker-messages.ts";
import { runInWorker, startWorker, type WorkerPlace, workerStartLimitMs } from "./worker-run.ts";
import { WorkerSlots } from "./worker-slots.ts";

/** The one file a run's worker starts with, next to this one. */
export const workerEntry = new URL("./worker-entry.ts", import.meta.url);

/** The most workers at once by default: 4, or fewer on a computer with fewer cores. */
export function defaultWorkerLimit(): number {
  return Math.min(4, availableParallelism());
}

/** Options for {@link createNodeWorkerToolScriptIsolate}. */
export interface NodeWorkerToolScriptIsolateOptions {
  /** The most a run gets; the agent defaults of ADR 2.3 when left out, as the Node engine runs `agent` only (ADR 2.2). */
  readonly limits?: ToolScriptLimits;
  /** The most runs in a worker at once, the rest waiting in order; {@link defaultWorkerLimit} when left out. */
  readonly maxWorkers?: number;
}

/**
 * A `ToolScriptIsolate` that runs each script in the QuickJS isolate inside
 * a `worker_threads` worker of its own (ADR "Halonic ToolScript" 2.2), so a
 * busy script never holds the parent's event loop. It takes **no host
 * functions**: a request with any is refused with `toolscript.failed`, as is
 * an input holding a secret handle, so nothing can be called across the
 * worker's port. That fits rule steps, which run with `functions: {}`.
 *
 * The parent checks every result itself and terminates the worker at its
 * CPU limit plus a short grace, at its wall clock, on cancel, and when the
 * run ends. At most `maxWorkers` run at once; the CPU and wall-clock limits
 * start when a run's worker has started, not while it waits for its turn.
 *
 * @example
 * const isolate = createNodeWorkerToolScriptIsolate();
 * const result = await isolate.run({ runId, code, input, functions: {}, limits: isolate.limits });
 */
export function createNodeWorkerToolScriptIsolate(
  options: NodeWorkerToolScriptIsolateOptions = {},
): ToolScriptIsolate {
  return workerIsolate(options, {
    entry: workerEntry,
    startWorker,
    startLimitMs: workerStartLimitMs,
  });
}

/** {@link createNodeWorkerToolScriptIsolate} with its workers at `place`; tests give their own. */
export function workerIsolate(
  options: NodeWorkerToolScriptIsolateOptions,
  place: WorkerPlace,
): ToolScriptIsolate {
  const limits = options.limits ?? toolScriptDefaultLimits.agent;
  const slots = new WorkerSlots(options.maxWorkers ?? defaultWorkerLimit());
  return {
    limits,
    run: async (request) => {
      const runLimits = effectiveToolScriptLimits(limits, request.limits);
      const refusal = refusalOf(request, runLimits);
      if (refusal !== undefined) return refusal;
      const release = await slots.take(request.signal);
      if (release === undefined) return failedRun("toolscript.cancelled", runLimits);
      try {
        return await runInWorker(
          place,
          {
            runId: request.runId,
            code: request.code,
            input: JSON.stringify(request.input),
            limits: runLimits,
          },
          request.signal,
        );
      } finally {
        release();
      }
    },
  };
}
