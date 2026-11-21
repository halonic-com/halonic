import type { AgentSettings, AgentStep } from "../api.ts";
import { configurationWords as words } from "../configuration/configuration-words.ts";

/** The key of an agent step's card in the agent page's stack. */
export const agentStepCardKey = ({ id }: Pick<AgentStep, "id">): string => `step/${id}`;

/** The agent step a card key names, or `undefined` for another kind of card. */
export function agentStepOfCard(key: string): string | undefined {
  return key.startsWith("step/") ? key.slice("step/".length) : undefined;
}

/**
 * An agent step's card on the agent page (flow-agents 7): what it is for, its instructions, and
 * the model and model call limit it runs with, its own or the agent's, its output and its tools.
 */
export function AgentStepCard({
  step,
  agent,
}: {
  readonly step: AgentStep;
  readonly agent: AgentSettings;
}) {
  const rows: readonly [string, string][] = [
    [words.instructions, step.instructions],
    [words.model, step.model ?? words.agentStepModelAgent(agent.model)],
    [words.turnLimit, step.maxSteps?.toString() ?? words.agentStepLimitAgent(agent.maxSteps)],
    [
      words.output,
      step.outputFields === undefined
        ? words.outputKinds.text
        : step.outputFields.join(", ") || words.outputKinds.json,
    ],
    [
      words.pageNames.tools,
      step.tools === undefined
        ? words.agentStepToolsAgent(agent.name)
        : step.tools.join(", ") || words.agentStepToolsNone,
    ],
  ];
  return (
    <div className="flex flex-col gap-4 p-4">
      {step.description !== undefined && step.description !== "" && (
        <p className="text-body text-fg-muted">{step.description}</p>
      )}
      <dl className="flex flex-col gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-caption text-fg-muted">{label}</dt>
            <dd className="whitespace-pre-wrap text-body text-fg">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
