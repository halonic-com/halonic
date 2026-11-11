// The system message of a run's agent: its file's instructions, its skills
// and what it should know about its tools and its reply, as the old runner
// (784f78d) put them together for each model call of a workflow step.

import type { Agent, AgentOutput } from "@halonicjs/format";
import type { ChatMessage } from "@halonicjs/ports";
import type { RunDefinitions } from "../kernel/decide-types.ts";
import { delegationHint } from "../tools/subagents/subagent-tools.ts";

/** The line an agent with connectors gets, so it uses outside systems only when the task needs it. */
export const connectorHint =
  "Tools named <connector>__<tool> act in outside systems. Use them only when the task needs it.";

/**
 * What a run's agent is told before its task, in this order: its
 * instructions; each skill its file lists, as `## Skill: <name>`, its
 * description and its body; {@link delegationHint} when it has subagents;
 * {@link connectorHint} when it has connectors; and how to reply when its
 * `output` is a choice or JSON. A skill the run's definitions don't have is
 * left out, as the old runner left it out.
 *
 * The old runner also described the agent's knowledge sources here. The
 * engine leaves that to `knowledge_search` and `knowledge_read`, whose
 * descriptions name the sources.
 *
 * @returns the parts joined by blank lines; `""` when there are none
 *
 * @example
 * agentSystemPrompt({ ...writer, instructions: "Write briefly.", output: { type: "choice", options: ["yes", "no"] } }, {});
 * // "Write briefly.\n\nReply with exactly one of: yes, no. No other words."
 */
export function agentSystemPrompt(
  agent: Agent,
  skills: NonNullable<RunDefinitions["skills"]>,
): string {
  const parts: string[] = [];
  const instructions = agent.instructions.trim();
  if (instructions !== "") parts.push(instructions);
  for (const id of agent.skills) {
    const skill = Object.hasOwn(skills, id) ? skills[id] : undefined;
    if (skill !== undefined) {
      parts.push(`## Skill: ${skill.name}\n${skill.description}\n\n${skill.body}`);
    }
  }
  if (agent.subagents.length > 0) parts.push(delegationHint);
  if (agent.connectors.length > 0) parts.push(connectorHint);
  const reply = replyHint(agent.output);
  if (reply !== undefined) parts.push(reply);
  return parts.join("\n\n");
}

/**
 * The first messages of a run's agent's turn: its system message from
 * {@link agentSystemPrompt}, when it has one, then the task. An agent the
 * run's definitions have no file for gets the task alone.
 */
export function runTurnMessages(
  agent: Agent | undefined,
  definitions: RunDefinitions,
  task: string,
): ChatMessage[] {
  const system = agent === undefined ? "" : agentSystemPrompt(agent, definitions.skills ?? {});
  const user: ChatMessage = { role: "user", content: task };
  return system === "" ? [user] : [{ role: "system", content: system }, user];
}

/** How an agent whose `output` is a choice or JSON must reply; none for text. */
function replyHint(output: AgentOutput): string | undefined {
  switch (output.type) {
    case "choice":
      return `Reply with exactly one of: ${output.options.join(", ")}. No other words.`;
    case "json":
      return `Reply with JSON only.${output.schema === undefined ? "" : ` It must match this JSON Schema: ${JSON.stringify(output.schema)}`}`;
    default:
      return undefined;
  }
}
