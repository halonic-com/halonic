// A `rule` state's one call: its rule's code, run once in a ToolScript
// isolate with no host functions (requirement `engine.rule-state`). The run
// log records no event for the call, so the executor works out what to run
// from the run and the definitions it started with, as the state does.

import { childInput, getState } from "@halonicjs/workflow";
import type { RunDefinitions } from "./decide-types.ts";
import type { RunState } from "./run-state.ts";

/**
 * Run the rule of the `rule` state the run is in. The executor reads the
 * code and the input with {@link ruleCallOf}, so a call carried out again
 * after a restart runs the same code on the same input.
 */
export interface RunRuleEffect {
  readonly type: "run-rule";
  readonly callId: string;
  readonly state: string;
}

/**
 * How a rule's run ended: its output, or why it failed. `reason` is the
 * isolate's reason code, such as `limit.cpu`, or `rule.missing` for a file
 * the run's definitions don't have and `rule.not-run` for an isolate that
 * refused the call.
 */
export type RuleResult =
  | { readonly type: "rule"; readonly output: unknown }
  | { readonly type: "rule"; readonly reason: string; readonly message?: string };

/** What one rule call runs: the rule's file and code, and `ctx.input`. */
export interface RuleCall {
  readonly callId: string;
  readonly state: string;
  readonly rule: string;
  /** `undefined` when the run's definitions have no code for `rule`. */
  readonly code: string | undefined;
  readonly input: Record<string, unknown>;
}

/**
 * The call id of a visit to a `rule` state: the visit's `seq` makes it
 * unique in the run, as a child run's id is, with no id generator.
 */
export function ruleCallId(enteredSeq: number): string {
  return `rule-${enteredSeq}`;
}

/**
 * The rule call the run waits on under `callId`, or `null` when it waits on
 * none: the run has moved on, ended, or isn't in a `rule` state. The input
 * is rendered against the scope `decide` gives the state, which nothing
 * changes while the call runs.
 */
export function ruleCallOf(
  run: RunState,
  definitions: RunDefinitions,
  callId: string,
): RuleCall | null {
  const { workflow } = definitions;
  if (run.status !== "running" || run.state === null || run.enteredSeq === null) return null;
  if (callId !== ruleCallId(run.enteredSeq) || !Object.hasOwn(workflow.states, run.state)) {
    return null;
  }
  const state = getState(workflow, run.state);
  if (state.type !== "rule" || state.rule === undefined) return null;
  const rules = definitions.rules ?? {};
  const scope = { input: run.input, context: { ...workflow.context, ...run.context } };
  return {
    callId,
    state: run.state,
    rule: state.rule,
    code: Object.hasOwn(rules, state.rule) ? rules[state.rule] : undefined,
    input: childInput(state.input, scope),
  };
}
