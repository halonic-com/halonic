// Makes the connector calls runs recorded (HAL-1532), one per `tool:` timer,
// each within its time limit. A call whose outcome no one can know, because
// it took too long, failed, or the engine stopped during it, is never made
// again on its own: its outcome becomes `unknown`, and the run waits.

import type { RunStore } from "@halonicjs/ports";
import type { CallToolEffect, DecideInput, ToolResult } from "../kernel/decide-types.ts";
import { brokeOff } from "../kernel/requested-effect.ts";
import { readRun } from "../kernel/step.ts";
import { connectorCallTimeoutMs } from "../states/task/effect.ts";
import type { StartDeadlines } from "./start-deadlines.ts";
import { UnrecordedResults } from "./unrecorded-results.ts";

/** The text of a call the engine was making when it stopped. */
export const stoppedDuringCall =
  "The engine stopped before this call had an answer, so it may or may not have done its work.";

/**
 * Makes a connector call a run recorded, and gives its result. It never
 * throws: a call that fails gives the outcome it had.
 */
export type CallTool = (effect: CallToolEffect) => Promise<ToolResult>;

/** Without `connectorCalls`, no `call-tool` effect gets this far; this answers one anyway. */
export const noConnectorCalls: CallTool = async () => ({
  type: "tool",
  result: "The call wasn't made: this engine makes no connector calls.",
  outcome: "error",
});

/** What the runner needs from the local runs. */
export interface RunConnectorCallRunnerOptions {
  readonly store: RunStore;
  /** Where the call's time limit is set. */
  readonly deadlines: StartDeadlines;
  readonly callTool: CallTool;
  /** Records an input for a run; one the run no longer takes changes nothing. */
  record(runId: string, input: DecideInput): Promise<void>;
  /** The time now, as an ISO string. */
  now(): string;
  /** True once the engine is closing: a result that arrives then isn't recorded. */
  isClosed(): boolean;
}

/** Makes the connector calls runs recorded, and marks those a stop cut short. */
export class RunConnectorCallRunner {
  readonly #options: RunConnectorCallRunnerOptions;
  /** The calls being made now, so a timer delivered twice makes one call. */
  readonly #calling = new Set<string>();
  readonly #unrecorded = new UnrecordedResults();

  constructor(options: RunConnectorCallRunnerOptions) {
    this.#options = options;
  }

  /**
   * A run the engine was making a connector call for when it stopped can't
   * know whether the call did its work. Its outcome becomes `unknown`, and
   * the run waits for a person instead of ending as interrupted. Call it
   * once on start, before any run moves on.
   */
  async markCutShort(): Promise<void> {
    const { store } = this.#options;
    for (const listed of await store.list({ status: "running" })) {
      const effect = (await readRun(store, listed.id))?.effect;
      if (effect == null || effect.unknown) continue;
      const result: ToolResult = { type: "tool", result: stoppedDuringCall, outcome: "unknown" };
      const at = this.#options.now();
      await this.#options.record(listed.id, {
        type: "effect-done",
        at,
        callId: effect.callId,
        result,
      });
    }
  }

  /**
   * Makes the connector call the run recorded under `callId`, within its
   * time limit. A call that takes longer breaks off with an unknown
   * outcome; its late answer is dropped, because the run then waits for a
   * person. A timer for a call the run no longer waits on changes nothing,
   * and one for a call whose result couldn't be recorded records it.
   */
  async make(runId: string, callId: string): Promise<void> {
    const slot = JSON.stringify([runId, callId]);
    if (this.#calling.has(slot)) return;
    this.#calling.add(slot);
    const record = (input: DecideInput) => this.#options.record(runId, input);
    try {
      if (await this.#unrecorded.recordKept(slot, record)) return;
      const effect = (await readRun(this.#options.store, runId))?.effect;
      if (effect == null || effect.unknown || effect.callId !== callId) return;
      // Only the call's own fields: the host never gets the prompt or the conversation.
      const { idempotencyKey, state, agent, connector, tool, args } = effect;
      const call: CallToolEffect = {
        type: "call-tool",
        callId,
        idempotencyKey,
        state,
        agent,
        connector,
        tool,
        args,
        timeoutMs: connectorCallTimeoutMs,
      };
      const result = await this.#withinLimit(runId, call);
      if (this.#options.isClosed()) return;
      const done: DecideInput = { type: "effect-done", at: this.#options.now(), callId, result };
      await this.#unrecorded.record(slot, done, record);
    } finally {
      this.#calling.delete(slot);
    }
  }

  #withinLimit(runId: string, call: CallToolEffect): Promise<ToolResult> {
    const limit = {
      timeoutMs: call.timeoutMs,
      start: () => this.#options.callTool(call),
      timedOut: () => new Error(`it took longer than ${call.timeoutMs / 1000} seconds`),
    };
    return this.#options.deadlines
      .connectorCall(runId, call.callId, limit)
      .catch((error: unknown): ToolResult => {
        const why = error instanceof Error ? error.message : String(error);
        return { type: "tool", result: brokeOff(why), outcome: "unknown" };
      });
  }
}
