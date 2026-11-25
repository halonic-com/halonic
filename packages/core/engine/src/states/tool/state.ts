import type { DecidedEvent, EffectDoneInput, ToolResult } from "../../kernel/decide-types.ts";
import {
  nothing,
  type StateContext,
  type StateHandler,
  type StateStep,
} from "../../kernel/registry.ts";
import { signalSent } from "../../kernel/step-signal.ts";
import {
  type ToolCheckResult,
  toolCheckCallId,
  toolStepArgs,
} from "../../kernel/tool-step-call.ts";
import { answersUnknownEffect, loggedToolResult, unknownOutcomeWait } from "../task/effect.ts";
import { answerToolApproval, answerUnknownToolCall, askForToolApproval, callTool } from "./call.ts";

/**
 * A `tool` state calls one tool of a connector, with no model (requirement
 * `engine.tool-state`). On entry it fails a tool its connector's `allow`
 * leaves out, before anything is listed or called; then it asks for a
 * `check-tool` effect, the check an agent's call to that tool gets. A call
 * that check lets run, or that a person approves, goes through the same
 * `effect.requested` and `call-tool` as an agent's; see `call.ts`. Its result
 * goes to `output`, and the state finishes with `done`; a person's no finishes
 * it with `rejected`, and a skipped call whose outcome is unknown with
 * `skipped`. A refused call, and a call that fails, fail the run.
 */
export const toolState: StateHandler<"tool"> = {
  type: "tool",
  enter: askForCheck,
  onInput: (context, input) => {
    if (input.type === "send") {
      return answersUnknownEffect(context, input)
        ? answerUnknownToolCall(context, input)
        : answerToolApproval(context, input);
    }
    if (input.type !== "effect-done") return nothing;
    if (input.result.type === "tool-check") return takeCheck(context, input, input.result);
    if (input.result.type === "tool") return takeResult(context, input, input.result);
    return nothing;
  },
};

function askForCheck({ run, stateId, state, connectorTools }: StateContext<"tool">): StateStep {
  const { connector, tool, output } = state;
  if (connector === undefined) return failed(`Tool step "${stateId}" names no connector.`);
  if (tool === undefined) return failed(`Tool step "${stateId}" names no tool.`);
  if (output === undefined) {
    return failed(`Tool step "${stateId}" has no output, so its result would go nowhere.`);
  }
  const lists = Object.hasOwn(connectorTools, connector) ? connectorTools[connector] : undefined;
  if (lists === undefined) {
    return failed(
      `Tool step "${stateId}" calls ${tool} of connector "${connector}", which the hub has no connector file for.`,
    );
  }
  if (lists.allow !== undefined && !lists.allow.includes(tool)) {
    return failed(
      `Tool step "${stateId}" calls ${tool}, which the tools.allow list of connector "${connector}" doesn't name.`,
    );
  }
  const callId = toolCheckCallId(run.enteredSeq as number);
  return { events: [], effects: [{ type: "check-tool", callId, state: stateId }] };
}

/** Only the check of this visit counts, while the state hasn't asked for its call yet. */
function takeCheck(
  context: StateContext<"tool">,
  input: EffectDoneInput,
  check: ToolCheckResult,
): StateStep {
  const { run, stateId, state } = context;
  if (input.callId !== toolCheckCallId(run.enteredSeq as number) || run.effect !== null) {
    return nothing;
  }
  if (run.approvals.some((approval) => approval.state === stateId)) return nothing;
  if (check.kind === "refused") {
    return failed(`Tool step "${stateId}" can't call ${state.tool}: ${check.reason}`);
  }
  const args = toolStepArgs(run, context, stateId);
  return check.kind === "ask"
    ? askForToolApproval(context, check.name, args)
    : callTool(context, check.name, args);
}

/**
 * The call's result. With an answer, it goes to `output`, as JSON when it
 * reads as JSON, else as the text. A call that failed fails the run: there is
 * no agent to hand its error to. With an unknown outcome, the run waits for
 * `retry` or `skip`. A result for any other call changes nothing.
 */
function takeResult(
  { run, stateId, state, scope }: StateContext<"tool">,
  input: EffectDoneInput,
  result: ToolResult,
): StateStep {
  const effect = run.effect;
  if (effect === null || effect.unknown || effect.callId !== input.callId) return nothing;
  if (effect.state !== stateId || state.output === undefined) return nothing;
  const logged = loggedToolResult(effect, result);
  if (result.outcome === "unknown") {
    return { events: [logged, unknownOutcomeWait(stateId)], effects: [] };
  }
  if (result.outcome === "error") {
    const error = `Tool step "${stateId}" called ${effect.tool}, which failed: ${result.result}`;
    return { events: [logged], effects: [], outcome: { type: "fail", error } };
  }
  const events: DecidedEvent[] = [
    logged,
    { type: "context.updated", key: state.output, value: outputOf(result.result) },
  ];
  events.push(...signalSent(stateId, state, scope, events));
  return { events, effects: [], outcome: { type: "finish", event: "done" } };
}

/** The tool's text as JSON when it reads as JSON, else the text itself. */
function outputOf(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function failed(error: string): StateStep {
  return { ...nothing, outcome: { type: "fail", error } };
}
