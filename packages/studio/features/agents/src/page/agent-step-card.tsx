import { AlertIcon } from "@halonicjs/studio-kit";
import { useMemo } from "react";
import type { AgentRef, AgentSettings, AgentStep, AgentsHost } from "../api.ts";
import { configurationWords as words } from "../configuration/configuration-words.ts";
import { modelCheck } from "../configuration/model-page.tsx";
import { useLoad } from "./use-load.ts";

/** The key of an agent step's card in the agent page's stack. */
export const agentStepCardKey = ({ id }: Pick<AgentStep, "id">): string => `step/${id}`;

/** The agent step a card key names, or `undefined` for another kind of card. */
export function agentStepOfCard(key: string): string | undefined {
  return key.startsWith("step/") ? key.slice("step/".length) : undefined;
}

/**
 * An agent step's card on the agent page (flow-agents 7): what it is for, its instructions, and
 * the model and model call limit it runs with, its own or the agent's, its output and its tools.
 * Its own model alias that the hub doesn't have is marked under it, as the Model page marks the
 * agent's (C605).
 */
export function AgentStepCard({
  step,
  agent,
  host,
}: {
  readonly step: AgentStep;
  readonly agent: AgentSettings;
  /** The host, for the hub's model aliases. */
  readonly host: AgentsHost;
}) {
  const missingAlias = useMissingAlias(host, agent, step.model);
  const rows: readonly [label: string, value: string, problem?: string | undefined][] = [
    [words.instructions, step.instructions],
    [words.model, step.model ?? words.agentStepModelAgent(agent.model), missingAlias],
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
        {rows.map(([label, value, problem]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-caption text-fg-muted">{label}</dt>
            <dd className="whitespace-pre-wrap text-body text-fg">{value}</dd>
            {problem === undefined ? null : (
              <dd className="flex items-start gap-1 text-caption text-danger">
                <span className="inline-grid size-icon-sm shrink-0 place-items-center *:size-full">
                  <AlertIcon />
                </span>
                {problem}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The sentence for an agent step's own model when the hub has no alias of that name; `undefined`
 * while the aliases are read, when they can't be, and for no model of its own, an alias or a
 * `provider/model` name. The card can't change the model, so it points to Models only.
 */
function useMissingAlias(
  host: AgentsHost,
  { hubId, id }: AgentRef,
  model: string | undefined,
): string | undefined {
  const source = useMemo(
    () => ({
      fetch: () => host.modelAliases({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const { load } = useLoad<readonly string[]>(source);
  if (model === undefined || load.kind !== "ready") return undefined;
  return modelCheck(model, load.value) === null ? undefined : words.agentStepUnknownAlias(model);
}
