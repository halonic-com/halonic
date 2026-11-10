// The tools an agent's file grants in a run (HAL-186 step 4d): the run log
// with `runLogs`, the records of its `collections`, and a `delegate_` tool
// per subagent. A chat turn gets none of them, because it belongs to no run
// and has no kept definitions.

import type { Agent } from "@halonicjs/format";
import type { Clock, RecordStore, RunStore } from "@halonicjs/ports";
import type { HalonicTool } from "../agent/turn-tools.ts";
import type { RunDefinitions } from "../kernel/decide-types.ts";
import { recordTools } from "../tools/records/record-tools.ts";
import { runLogTools } from "../tools/run-log/run-log-tools.ts";
import { type DelegatedTask, subagentTools } from "../tools/subagents/subagent-tools.ts";

/** What {@link runAgentTools} needs: the agent, the run it is in, and the stores its tools read. */
export interface RunAgentToolsOptions {
  /** The agent whose file grants the tools. */
  readonly agent: Agent;
  readonly hubId: string;
  readonly runId: string;
  /** The state the run is in, which a subagent's `agent.*` events name. */
  readonly state: string;
  /** The definitions the run started with: its agents and collections. */
  readonly definitions: RunDefinitions;
  /** The agent's depth: 0 for a state's agent, 1 for its subagent, and so on. */
  readonly depth: number;
  readonly runs: Pick<RunStore, "list" | "get" | "events">;
  /** Where records live; without it, an agent with `collections` gets no records tools. */
  readonly records?: RecordStore;
  readonly clock: Clock;
  /** Runs a subagent's own turn on a task and gives its answer. */
  runSubagent(task: DelegatedTask): Promise<unknown>;
}

/**
 * The run-log, records and subagent tools of a run's agent (requirement
 * `engine.run-agent-tools`), in that order; none for a field the agent's
 * file leaves at its default.
 */
export function runAgentTools(options: RunAgentToolsOptions): HalonicTool[] {
  const { agent, clock, records, runId } = options;
  const tools: HalonicTool[] = [];
  if (agent.runLogs) {
    tools.push(...runLogTools({ runs: options.runs, clock, hubId: options.hubId, runId }));
  }
  if (records !== undefined && agent.collections.length > 0) {
    tools.push(
      ...recordTools({
        collectionIds: agent.collections,
        collections: options.definitions.collections ?? {},
        records,
        clock,
        agent: agent.id,
        runId,
      }),
    );
  }
  if (agent.subagents.length > 0) {
    tools.push(
      ...subagentTools({
        agent,
        hubAgents: options.definitions.agents ?? {},
        depth: options.depth,
        state: options.state,
        runSubagent: options.runSubagent,
      }),
    );
  }
  return tools;
}
