import type { StackedCard } from "@halonicjs/studio-shell";
import type { AgentListing, AgentRef, AgentSettings, AgentsHost } from "../api.ts";
import { AgentStepCard, agentStepOfCard } from "./agent-step-card.tsx";
import { SubagentCard, subagentOfCard } from "./subagent-card.tsx";
import type { Load } from "./use-load.ts";

/** A card on the page's stack: an agent step of this agent, or a subagent. */
export function PageCard({
  card,
  host,
  hubId,
  settings,
  openSubagent,
  openAgent,
  announce,
}: {
  readonly card: StackedCard;
  readonly host: AgentsHost;
  readonly hubId: string;
  readonly settings: Load<AgentSettings>;
  readonly openSubagent: (agent: AgentListing) => void;
  readonly openAgent: ((agent: AgentRef) => void) | undefined;
  readonly announce: ((text: string) => void) | undefined;
}) {
  const step = agentStepOfCard(card.key);
  if (step !== undefined) {
    const agentSettings = settings.kind === "ready" ? settings.value : undefined;
    const found = agentSettings?.agentSteps.find((each) => each.id === step);
    return found === undefined || agentSettings === undefined ? null : (
      <AgentStepCard step={found} agent={agentSettings} />
    );
  }
  const subagent = subagentOfCard(card.key);
  return subagent === undefined ? null : (
    <SubagentCard
      host={host}
      agent={{ hubId, id: subagent }}
      name={card.title}
      openSubagent={openSubagent}
      openAgent={openAgent}
      announce={announce}
    />
  );
}
