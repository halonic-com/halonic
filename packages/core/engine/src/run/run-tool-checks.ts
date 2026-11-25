// Checks the calls of `tool` states (requirement `engine.tool-state`), one
// per `tool-check:` timer. A check only reads, so a timer delivered again
// after a restart checks again with nothing lost.

import type { BlobStore, RunStore } from "@halonicjs/ports";
import type { DecideInput } from "../kernel/decide-types.ts";
import { definitionsOf } from "../kernel/kept-definitions.ts";
import { hasEnded, type RunState } from "../kernel/run-state.ts";
import { readRun } from "../kernel/step.ts";
import {
  type ToolCheckResult,
  type ToolStepCall,
  toolStepCallOf,
} from "../kernel/tool-step-call.ts";

/**
 * Checks a tool step's call as an agent's call to that tool is checked. It
 * never throws: a check that can't be made gives `refused`, with why.
 */
export type CheckTool = (call: ToolStepCall, run: RunState) => Promise<ToolCheckResult>;

/** Without `connectorCalls`, no `check-tool` effect gets this far; this answers one anyway. */
export const noToolChecks: CheckTool = async () => ({
  type: "tool-check",
  kind: "refused",
  reason: "this engine makes no connector calls",
});

/** What the check runner needs from the local runs. */
export interface RunToolChecksOptions {
  readonly store: Pick<RunStore, "events" | "snapshot">;
  /** Where the run's definitions are kept. */
  readonly blobs: Pick<BlobStore, "get">;
  readonly checkTool: CheckTool;
  /** Records an input for a run; one the run no longer takes changes nothing. */
  record(runId: string, input: DecideInput): Promise<void>;
  /** The time now, as an ISO string. */
  now(): string;
  /** True once the engine is closing: a result that arrives then isn't recorded. */
  isClosed(): boolean;
}

/** Checks the call a tool step waits on, and records what the check found. */
export class RunToolChecks {
  readonly #options: RunToolChecksOptions;
  /** The checks running now, so a timer delivered twice checks once. */
  readonly #checking = new Set<string>();

  constructor(options: RunToolChecksOptions) {
    this.#options = options;
  }

  /** Checks the call `callId` of `runId`, when the run still waits on it. */
  async check(runId: string, callId: string): Promise<void> {
    const slot = JSON.stringify([runId, callId]);
    if (this.#checking.has(slot)) return;
    this.#checking.add(slot);
    try {
      const run = await readRun(this.#options.store, runId);
      if (run === null || hasEnded(run.status)) return;
      const definitions = await definitionsOf(this.#options.blobs, run.definitionsVersion);
      const call = toolStepCallOf(run, definitions, callId);
      if (call === null) return;
      const result = await this.#options.checkTool(call, run);
      if (this.#options.isClosed()) return;
      await this.#options.record(runId, {
        type: "effect-done",
        at: this.#options.now(),
        callId,
        result,
      });
    } finally {
      this.#checking.delete(slot);
    }
  }
}
