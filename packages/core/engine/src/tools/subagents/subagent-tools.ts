// `delegate_<id>`: an agent hands a task to one of its subagents, which runs
// its own turn on it and answers. The subagent sees only the task, never
// the conversation, so the tool asks for everything it needs.

import type { Agent } from "@halonicjs/format";
import type { TurnStop } from "../../agent/turn-approval.ts";
import type { TurnLog } from "../../agent/turn-log.ts";
import type { HalonicTool, SubagentStopped } from "../../agent/turn-tools.ts";

/** How deep delegation goes when the caller sets no limit: an agent's subagent's subagent's subagent. */
export const defaultMaxDelegationDepth = 3;

/** The line an agent with subagents gets in its instructions, so it knows to brief them fully. */
export const delegationHint =
  "You can hand tasks to other agents with the delegate_* tools. Give them everything they need; they cannot see this conversation.";

/** One task handed to a subagent. */
export interface DelegatedTask {
  /** The subagent's id. */
  readonly agent: string;
  readonly task: string;
  /** The id of the agent that hands it the task. */
  readonly parent: string;
  /** The subagent's depth: one more than its parent's. */
  readonly depth: number;
}

/**
 * How a subagent's turn ended: with its answer, or stopped at a call that
 * waits for a person's OK or for the engine, as a run's turn stops.
 */
export type SubagentOutcome =
  | { readonly kind: "answer"; readonly content: unknown }
  | { readonly kind: "stopped"; readonly stop: TurnStop };

/** What the subagent tools need: who delegates, to whom, and how a subagent runs. */
export interface SubagentToolsOptions {
  /** The agent that delegates. */
  readonly agent: Pick<Agent, "id" | "subagents">;
  /** The agents of the agent's hub by id; a subagent must be one of them. */
  readonly hubAgents: Readonly<Record<string, Pick<Agent, "id" | "name" | "description">>>;
  /** The agent's own depth: 0 for a state's agent, 1 for its subagent, and so on. */
  readonly depth: number;
  /** The deepest a subagent may be; {@link defaultMaxDelegationDepth} when left out. */
  readonly maxDepth?: number;
  /** The state the run is in, which the `agent.*` events name. */
  readonly state: string;
  /** Where `agent.started` and `agent.finished` go; a turn outside any run has none. */
  readonly log?: TurnLog;
  /**
   * Runs the subagent's own turn on the task, with its own model, tools and
   * instructions, and gives its answer, or where it stopped.
   *
   * @throws when the subagent fails; the delegating model gets the error
   */
  runSubagent(task: DelegatedTask): Promise<SubagentOutcome>;
}

/**
 * One `delegate_<id>` tool for each of the agent's subagents (requirement
 * `engine.subagent-tools`). A subagent that isn't in the hub, and the agent
 * itself, are left out. At the depth limit the agent gets none, so a loop
 * of agents that delegate to each other ends there.
 *
 * @example
 * const tools = subagentTools({ agent: reviewer, hubAgents, depth: 0, state: "review", runSubagent });
 * tools.map((tool) => tool.definition.name); // ["delegate_checker"]
 */
export function subagentTools(options: SubagentToolsOptions): HalonicTool[] {
  if (options.depth >= (options.maxDepth ?? defaultMaxDelegationDepth)) {
    return [];
  }
  const tools: HalonicTool[] = [];
  for (const subagentId of options.agent.subagents) {
    // An own key only: an id such as `constructor` must not find Object.prototype's.
    const subagent = Object.hasOwn(options.hubAgents, subagentId)
      ? options.hubAgents[subagentId]
      : undefined;
    if (subagent !== undefined && subagentId !== options.agent.id) {
      tools.push(delegateTool(options, subagent));
    }
  }
  return tools;
}

/** The name of the tool that hands a task to an agent: `delegate_<id>`, in the characters and length a tool name allows. */
export function delegateToolName(agentId: string): string {
  return `delegate_${agentId.replace(/[^a-zA-Z0-9_-]/g, "_")}`.slice(0, 64);
}

function delegateTool(
  options: SubagentToolsOptions,
  subagent: Pick<Agent, "id" | "name" | "description">,
): HalonicTool {
  const about = subagent.description ? `: ${subagent.description}` : "";
  const runOrStop = (args: Record<string, unknown>) => delegate(options, subagent.id, args);
  return {
    definition: {
      name: delegateToolName(subagent.id),
      description: `Hand a task to the "${subagent.name}" agent${about}. Returns its answer.`,
      parameters: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "What the agent should do, with all the context it needs.",
          },
        },
        required: ["task"],
      },
    },
    run: async (args) => {
      const done = await runOrStop(args);
      if (typeof done !== "string") {
        throw new Error(`the "${subagent.name}" agent stopped to wait, which only a run can do`);
      }
      return done;
    },
    runOrStop,
  };
}

/**
 * Hands the task to the subagent and gives its answer as text. A subagent
 * that stopped gives its stop, and its `agent.finished` waits until it
 * answers, because it hasn't finished.
 */
async function delegate(
  options: SubagentToolsOptions,
  subagentId: string,
  args: Record<string, unknown>,
): Promise<string | SubagentStopped> {
  const task = args["task"];
  if (typeof task !== "string" || task.trim() === "") {
    throw new Error('"task" is required: say what the agent should do');
  }
  const parent = options.agent.id;
  const named = { state: options.state, agent: subagentId, parent };
  await options.log?.append({ type: "agent.started", ...named, prompt: task });
  const outcome = await options.runSubagent({
    agent: subagentId,
    task,
    parent,
    depth: options.depth + 1,
  });
  if (outcome.kind === "stopped") {
    return { kind: "subagent-stopped", agent: subagentId, stop: outcome.stop };
  }
  const output = outcome.content;
  await options.log?.append({ type: "agent.finished", ...named, output });
  return typeof output === "string" ? output : (JSON.stringify(output) ?? "");
}
