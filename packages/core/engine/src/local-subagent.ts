// A subagent's turn in a run of the local executor, apart from the executor so
// the subagent path can grow without growing the executor.

import type { ChatTurnRequest, Clock, ConnectorClient, Secrets } from "@halonicjs/ports";
import { runToolCheckOf } from "./agent/check-run-tool-call.ts";
import type { ResolvedModel } from "./agent/model-chain.ts";
import { runAgentTurn } from "./agent/run-model-turn.ts";
import type { EffectBoundary } from "./agent/run-tool-call.ts";
import type { HalonicTool } from "./agent/turn-tools.ts";
import type { RunDefinitions } from "./kernel/decide-types.ts";
import { agentIn } from "./kernel/kept-definitions.ts";
import type { RunState } from "./kernel/run-state.ts";
import type { AgentKnowledge } from "./knowledge/agent-knowledge.ts";
import { runConnectorsOf } from "./run/connector-calls.ts";
import type { DelegatedTask, SubagentOutcome } from "./tools/subagents/subagent-tools.ts";

/**
 * The round limit of a run's model call when the run's definitions have no
 * file for its agent: the format's default for an agent's `maxSteps`.
 */
export const defaultRunMaxRounds = 6;

/** The run and state a run's model call is for, with the definitions the run started with. */
export interface RunTurn {
  readonly run: RunState;
  readonly state: string;
  readonly definitions: RunDefinitions;
  /**
   * Whether the turn is a `parallel` branch's, or a subagent's under one.
   * Such a turn is offered only the connector tools that read and wait for
   * no one, because a branch can't stop the run (HAL-4630).
   */
  readonly inBranch: boolean;
}

/** What a subagent's turn takes from the `LocalExecutor` that runs it. */
export interface LocalSubagentContext {
  /** The turn of the run the task was delegated in. */
  readonly turn: RunTurn;
  /** Picks the subagent's model, as `LocalExecutorOptions.resolveModel` does. */
  resolveModel(request: ChatTurnRequest): Promise<ResolvedModel>;
  readonly secrets: Secrets;
  readonly clock: Clock;
  /** The connected servers; the subagent gets their tools only with `effects`. */
  readonly connectors: readonly ConnectorClient[];
  /** Where the turn hands over connector calls that can change things; set with `runs.connectorCalls`. */
  readonly effects?: EffectBoundary;
  /** The knowledge sources of an agent in the turn's run. */
  knowledgeOf(agentId: string): AgentKnowledge;
  /** The Halonic tools of an agent in the turn's run, at a depth, with its knowledge. */
  toolsOf(agentId: string, depth: number, knowledge: AgentKnowledge): readonly HalonicTool[];
}

/**
 * A subagent's own turn on a task, one level deeper, on its own model and
 * with its own tools: with `runs.connectorCalls`, the connector tools its
 * own file lists, as the state's agent gets them, or as a `parallel` branch
 * gets them when the turn is under one. Its calls are checked as a run's
 * are ({@link runToolCheckOf}), so a call that needs a person's OK, or one
 * the engine must make, stops the subagent's turn, and the turn that
 * delegated to it stops at the `delegate_*` call (HAL-3361).
 *
 * Given `task.resumeFrom`, its turn goes on from where it stopped.
 *
 * @returns the subagent's answer, or where its turn stopped
 */
export async function runLocalSubagent(
  context: LocalSubagentContext,
  task: DelegatedTask,
): Promise<SubagentOutcome> {
  const { turn } = context;
  const subagent = agentIn(turn.definitions, task.agent);
  const messages = [{ role: "user" as const, content: task.task }];
  const model = await context.resolveModel({
    hubId: turn.run.hubId,
    agentId: task.agent,
    messages,
    tools: [],
  });
  const knowledge = context.knowledgeOf(task.agent);
  const lists = turn.definitions.connectorTools ?? {};
  const connectors = runConnectorsOf(context.connectors, subagent, lists, turn.inBranch);
  const outcome = await runAgentTurn({
    model,
    secrets: context.secrets,
    messages,
    halonicTools: context.toolsOf(task.agent, task.depth, knowledge),
    connectors: context.effects === undefined ? [] : connectors,
    ...(context.effects === undefined ? {} : { effects: context.effects }),
    maxRounds: subagent?.maxSteps ?? defaultRunMaxRounds,
    agent: task.agent,
    clock: context.clock,
    checkCall: runToolCheckOf(lists),
    autoKnowledge: knowledge.auto,
    ...(task.resumeFrom === undefined ? {} : { resumeFrom: task.resumeFrom }),
  });
  return outcome.kind === "stopped" ? outcome : { kind: "answer", content: outcome.result.content };
}
