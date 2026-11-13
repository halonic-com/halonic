// A run's model call: one agent turn built from the call and the run's kept
// definitions, which stops with the run. The host's `abortOnStop` hands the
// turn an `AbortSignal` for the call's `StopSignal`, and the answer of a call
// stopped while it ran is dropped.

import type { ChatTurnRequest, Clock, ConnectorClient, Secrets } from "@halonicjs/ports";
import type { StopSignal } from "@halonicjs/std";
import { runToolCheckOf } from "../agent/check-run-tool-call.ts";
import type { ResolvedModel } from "../agent/model-chain.ts";
import { agentParamsOf } from "../agent/model-params.ts";
import { runAgentTurn } from "../agent/run-model-turn.ts";
import type { EffectBoundary } from "../agent/run-tool-call.ts";
import type { TurnLog } from "../agent/turn-log.ts";
import type { HalonicTool } from "../agent/turn-tools.ts";
import type { ModelCallResult } from "../kernel/decide-types.ts";
import { branchOfCall } from "../kernel/run-branches.ts";
import type { PendingCall } from "../kernel/run-state.ts";
import { callMethodOf } from "../kernel/step-method.ts";
import { callAgentOf } from "../kernel/step-output.ts";
import type { AgentKnowledge } from "../knowledge/agent-knowledge.ts";
import { defaultRunMaxRounds, type RunTurn } from "../local-subagent.ts";
import type { AbortOnStop } from "./abort-on-stop.ts";
import { runTurnMessages } from "./agent-system-prompt.ts";
import { openRunConnectorsOf } from "./connector-calls.ts";
import { methodConnectors, methodHalonicTools } from "./method-tools.ts";

/** What {@link runModelCall} needs for one model call of a run. */
export interface RunModelCall {
  /** The run, the state and the kept definitions the call is made in. */
  readonly turn: RunTurn;
  readonly call: PendingCall;
  /** Picks the model of the call's agent, with its fallbacks. */
  resolveModel(request: ChatTurnRequest): Promise<ResolvedModel>;
  readonly secrets: Secrets;
  readonly clock: Clock;
  /**
   * Opens the run's connected servers, those of its top-level run; absent
   * when the executor makes no connector calls, and the turn gets none.
   */
  readonly connectorsOfRun?: () => Promise<readonly ConnectorClient[]>;
  /** Where the turn hands over connector calls that can change things. */
  readonly effects?: EffectBoundary;
  readonly localOnly: boolean;
  /** The agent's knowledge sources, built on a resumed call too: the model can still search after the OK. */
  readonly knowledge: AgentKnowledge;
  readonly log: TurnLog;
  /**
   * The agent's Halonic tools. A subagent's turn they start stops with
   * `signal`, the stop of this turn; it is absent without `abortOnStop`.
   */
  toolsOf(signal?: AbortSignal): readonly HalonicTool[];
  /** Told to stop when the run is cancelled or ends, or the engine stops. */
  readonly stop: StopSignal;
  /** The host's way to abort the turn's model call on `stop`; without it the call runs to its end. */
  readonly abortOnStop?: AbortOnStop;
}

/**
 * Runs a run's model call: the state's prompt to its agent's model, with the agent's Halonic
 * tools (`toolsOf`) and the tools of the connected servers its kept file lists that their kept
 * files allow ({@link openRunConnectorsOf}), through the same turn loop a chat turn uses. Every
 * call is checked with `checkToolCall` first, and a connector call its kept file puts under
 * `approve` asks a person ({@link runToolCheckOf}), and the agent's `maxSteps` is the round
 * limit. The model gets the agent's instructions and skills as a system message
 * ({@link runTurnMessages}).
 *
 * A call for a step with `method` uses the method's `model` as the alias, its `maxSteps` as the
 * round limit, and only the tools its `tools` names ({@link methodHalonicTools}).
 *
 * A connector tool its kept file lists under `read`, and not under `approve`, counts as reading:
 * its calls run without a person's OK, and the run log gets a `tool.unasked` before each one. A
 * `parallel` branch's or a `foreach` item's call, and any call in a run a `foreach` item started
 * or below it (`turn.alongsideOthers`), is offered only those tools ({@link openRunConnectorsOf}):
 * none can make a call that changes things, because a run records one effect at a time, and a
 * call that waits for a person would only end the branch or fail the run.
 *
 * A call that needs a person's OK ends the call with `{ type: "approval",
 * tool, args, resume }`, and the run waits. A connector call that can
 * change things passes the "allow sending" check, then ends the call with
 * `{ type: "effect", connector, tool, args, resume }`: the engine records
 * it before it makes it. Either way, the next call carries `resume` with
 * the answer or the result, and the turn goes on from there.
 *
 * When `stop` is told to stop, the model call going on is aborted (with
 * `abortOnStop`) and no other model is tried.
 *
 * @throws the stop's reason, once `stop` was told to stop, even when the turn ran to its end
 * @throws Error when the turn reached its round limit while the model still called tools
 */
export async function runModelCall(input: RunModelCall): Promise<ModelCallResult> {
  const { turn, call, stop } = input;
  const branch = branchOfCall(turn.run.parallel, call.callId)?.name;
  const agent = callAgentOf(turn.definitions, call.state, call.agent, branch);
  const method = callMethodOf(turn.definitions, call.state, call.agent, branch);
  const messages = runTurnMessages(agent, turn.definitions, call.prompt);
  const model = await input.resolveModel({
    hubId: turn.run.hubId,
    agentId: call.agent,
    ...(method?.model === undefined ? {} : { alias: method.model }),
    messages,
    tools: [],
  });
  const connectorTools = turn.definitions.connectorTools ?? {};
  const connectors =
    input.connectorsOfRun === undefined
      ? []
      : methodConnectors(
          await openRunConnectorsOf(
            input.connectorsOfRun,
            agent,
            connectorTools,
            turn.alongsideOthers,
          ),
          method,
        );
  const maxRounds = method?.maxSteps ?? agent?.maxSteps ?? defaultRunMaxRounds;
  const agentTurn = (signal?: AbortSignal) =>
    runAgentTurn({
      model,
      secrets: input.secrets,
      messages,
      halonicTools: methodHalonicTools(input.toolsOf(signal), method),
      connectors,
      connectorTools,
      ...(turn.definitions.declaredTools === undefined
        ? {}
        : { declaredTools: turn.definitions.declaredTools }),
      ...(input.effects === undefined ? {} : { effects: input.effects }),
      ...agentParamsOf(agent),
      maxRounds,
      agent: call.agent,
      clock: input.clock,
      checkCall: runToolCheckOf(connectorTools),
      autoKnowledge: input.knowledge.auto,
      log: input.log,
      ...(call.resume === undefined ? {} : { resumeFrom: call.resume }),
      localOnly: input.localOnly,
      ...(signal === undefined ? {} : { signal }),
    });
  const outcome = await (input.abortOnStop?.(stop, agentTurn) ?? agentTurn());
  // A call stopped while it ran gives nothing, even when it ran to its end.
  stop.throwIfStopped();
  if (outcome.kind === "stopped") return outcome.stop;
  // An answer cut off at the limit isn't the agent's answer: the state mustn't go on with it.
  if (outcome.result.atRoundLimit === true) {
    throw new Error(
      `Agent "${call.agent}" used all ${maxRounds} of its steps (maxSteps) and was still calling tools, so it gave no answer.`,
    );
  }
  return { type: "model", output: outcome.result.content };
}
