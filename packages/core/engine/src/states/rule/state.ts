import type { DecidedEvent, EffectDoneInput } from "../../kernel/decide-types.ts";
import {
  nothing,
  type StateContext,
  type StateHandler,
  type StateStep,
} from "../../kernel/registry.ts";
import { type RuleResult, ruleCallId } from "../../kernel/rule-call.ts";
import { signalSent } from "../../kernel/step-signal.ts";

/**
 * A `rule` state runs one pure function of the hub, with no model
 * (requirement `engine.rule-state`). On entry it asks for a `run-rule`
 * effect; the executor runs the rule in a ToolScript isolate with no host
 * functions and gives back its output, which goes to `output`, and the state
 * finishes with `done`. A rule that fails fails the run, with its reason
 * code in the error.
 */
export const ruleState: StateHandler<"rule"> = {
  type: "rule",
  enter: askForRule,
  onInput: (context, input) => {
    if (input.type === "effect-done" && input.result.type === "rule") {
      return ruleDone(context, input, input.result);
    }
    return nothing;
  },
};

function askForRule({ run, stateId, state }: StateContext<"rule">): StateStep {
  if (state.rule === undefined) {
    return failed(`Rule step "${stateId}" names no file.`);
  }
  if (state.output === undefined) {
    return failed(`Rule step "${stateId}" has no output, so its result would go nowhere.`);
  }
  const callId = ruleCallId(run.enteredSeq as number);
  return { events: [], effects: [{ type: "run-rule", callId, state: stateId }] };
}

/** Only the call of this visit counts; a result for any other changes nothing. */
function ruleDone(
  { run, stateId, state, scope }: StateContext<"rule">,
  input: EffectDoneInput,
  result: RuleResult,
): StateStep {
  if (input.callId !== ruleCallId(run.enteredSeq as number) || state.output === undefined) {
    return nothing;
  }
  if ("reason" in result) {
    const why = result.message === undefined ? "" : `: ${result.message}`;
    return failed(`Rule step "${stateId}" failed with ${result.reason}${why}`);
  }
  const events: DecidedEvent[] = [
    { type: "context.updated", key: state.output, value: result.output },
  ];
  events.push(...signalSent(stateId, state, scope, events));
  return { events, effects: [], outcome: { type: "finish", event: "done" } };
}

function failed(error: string): StateStep {
  return { ...nothing, outcome: { type: "fail", error } };
}
