import { Field, Select, type SelectOption } from "@halonicjs/studio-kit";
import type { AutoSaved } from "@halonicjs/studio-shell";
import type { WorkflowAgentChoice } from "../api.ts";
import { pickNow } from "./field-saving.ts";
import { pageWords } from "./page-words.ts";

const words = pageWords.stepCard;

/**
 * The Agent picker: "No agent" first, then the hub's agents. An agent the file names that the hub
 * doesn't have stays in the list by its id, so it isn't lost; the canvas says it's missing.
 */
function agentOptions(
  agents: readonly WorkflowAgentChoice[],
  picked: string,
): readonly SelectOption[] {
  const options = [
    { value: "", label: pageWords.noAgent },
    ...agents.map((one) => ({ value: one.id, label: one.name })),
  ];
  if (picked !== "" && !agents.some((one) => one.id === picked)) {
    options.push({ value: picked, label: picked });
  }
  return options;
}

/**
 * The docked card's **Agent** field. While it still shows the agent the checks found missing, it
 * is marked invalid ("Pick one of this hub's agents.") and described by the card's sentence for
 * that problem too, with its "Did you mean …" (`workflows.page.docked-card-problems`). A new pick
 * is checked again once it is saved, so the mark goes with the pick.
 */
export function AgentField({
  agent,
  saved,
  agents,
  problem,
}: {
  readonly agent: AutoSaved;
  /** The agent the file names, which the checks looked at. */
  readonly saved: string;
  readonly agents: readonly WorkflowAgentChoice[];
  /** The id of the card's sentence that says the agent is missing; absent when it isn't. */
  readonly problem: string | undefined;
}) {
  const marked = problem !== undefined && agent.value === saved;
  return (
    <Field
      label={words.agent}
      hint={agent.value === "" ? words.noAgent : undefined}
      error={marked ? words.agentNotInHub : null}
    >
      <Select
        options={agentOptions(agents, agent.value)}
        value={agent.value}
        onChange={pickNow(agent)}
        describedBy={marked ? problem : undefined}
      />
    </Field>
  );
}
