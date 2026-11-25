// Runs the rules of `rule` states (requirement `engine.rule-state`), one per
// `rule:` timer, in a fresh ToolScript isolate each time. A rule is pure, so
// a timer delivered again after a restart runs it again with nothing lost.

import {
  type BlobStore,
  effectiveToolScriptLimits,
  type RunStore,
  type ToolScriptIsolate,
  type ToolScriptIsolateValue,
  toolScriptDefaultLimits,
} from "@halonicjs/ports";
import type { DecideInput } from "../kernel/decide-types.ts";
import { definitionsOf } from "../kernel/kept-definitions.ts";
import { type RuleCall, type RuleResult, ruleCallOf } from "../kernel/rule-call.ts";
import { hasEnded } from "../kernel/run-state.ts";
import { readRun } from "../kernel/step.ts";

/** What the rule runner needs from the local runs. */
export interface RunRulesOptions {
  readonly store: Pick<RunStore, "events" | "snapshot">;
  /** Where the run's definitions are kept, with its rules' code. */
  readonly blobs: Pick<BlobStore, "get">;
  /** Without it, no `run-rule` effect gets this far: the run fails at the rule step. */
  readonly isolate: ToolScriptIsolate | undefined;
  /** Records an input for a run; one the run no longer takes changes nothing. */
  record(runId: string, input: DecideInput): Promise<void>;
  /** The time now, as an ISO string. */
  now(): string;
  /** True once the engine is closing: a result that arrives then isn't recorded. */
  isClosed(): boolean;
}

/** Runs the rule a run waits on, and records its result. */
export class RunRules {
  readonly #options: RunRulesOptions;
  /** The calls running now, so a timer delivered twice runs the rule once. */
  readonly #running = new Set<string>();

  constructor(options: RunRulesOptions) {
    this.#options = options;
  }

  /** Runs the call `callId` of `runId`, when the run still waits on it. */
  async run(runId: string, callId: string): Promise<void> {
    const slot = JSON.stringify([runId, callId]);
    if (this.#running.has(slot)) return;
    this.#running.add(slot);
    try {
      const run = await readRun(this.#options.store, runId);
      if (run === null || hasEnded(run.status)) return;
      const definitions = await definitionsOf(this.#options.blobs, run.definitionsVersion);
      const call = ruleCallOf(run, definitions, callId);
      if (call === null) return;
      const result = await this.#resultOf(runId, call);
      if (this.#options.isClosed()) return;
      await this.#options.record(runId, {
        type: "effect-done",
        at: this.#options.now(),
        callId,
        result,
      });
    } finally {
      this.#running.delete(slot);
    }
  }

  /**
   * The rule's run in the isolate, with no host functions and the agent
   * limits of the ToolScript ADR: the isolate's own limits, lowered to those.
   */
  async #resultOf(runId: string, call: RuleCall): Promise<RuleResult> {
    const { isolate } = this.#options;
    if (call.code === undefined) {
      const message = `The rule file "${call.rule}" isn't among the definitions this run started with.`;
      return { type: "rule", reason: "rule.missing", message };
    }
    if (isolate === undefined) {
      return { type: "rule", reason: "rule.not-run", message: "This engine has no isolate." };
    }
    try {
      const outcome = await isolate.run({
        runId: `${runId}:${call.callId}`,
        code: call.code,
        input: call.input as ToolScriptIsolateValue,
        functions: {},
        limits: effectiveToolScriptLimits(isolate.limits, toolScriptDefaultLimits.agent),
      });
      if (outcome.ok) return { type: "rule", output: outcome.output };
      const message = outcome.message === undefined ? {} : { message: outcome.message };
      return { type: "rule", reason: outcome.reason, ...message };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { type: "rule", reason: "rule.not-run", message };
    }
  }
}
