import { inlineLinkClasses, useToastStore } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { useMemo } from "react";
import type { AgentChange, AgentListing, AgentRef, AgentsHost, AgentTeamMember } from "../api.ts";
import { Configuration } from "../configuration/configuration.tsx";
import { useConfigurationLoads } from "../configuration/use-configuration-loads.ts";
import { pageWords } from "./page-words.ts";
import { TeamChart } from "./team-chart.tsx";
import { useLoad } from "./use-load.ts";

/** The key of a subagent's card in the agent page's stack. */
export const subagentCardKey = ({ id }: AgentRef): string => `subagent/${id}`;

/** The subagent a card key names, or `undefined` for another kind of card. */
export function subagentOfCard(key: string): string | undefined {
  return key.startsWith("subagent/") ? key.slice("subagent/".length) : undefined;
}

/** Props for {@link SubagentCard}. */
export interface SubagentCardProps {
  readonly host: AgentsHost;
  /** The subagent the card shows. */
  readonly agent: AgentRef;
  readonly name: string;
  /** Opens one of the subagent's own subagents as a card on top of this one. */
  readonly openSubagent: (agent: AgentListing) => void;
  /** Opens another agent's page, from the team chart; absent where the app can't. */
  readonly openAgent?: ((agent: AgentRef) => void) | undefined;
  /** Reads text to screen readers, politely, for its Subagents page's changes; absent says nothing. */
  readonly announce?: ((text: string) => void) | undefined;
}

/**
 * A subagent's card on the agent page (flow-agents 5.4 and 7): **Open *Writer* ›** to its own
 * page where the app can open one, its team chart, then the subagent's own Configuration in the
 * narrow panel, so its settings can be read and changed without leaving the agent it works for.
 * Its subagents open as cards on top of it.
 */
export function SubagentCard({
  host,
  agent,
  name,
  openSubagent,
  openAgent,
  announce,
}: SubagentCardProps) {
  const { settings, aliases, defaultModel } = useConfigurationLoads(host, agent);
  const { hubId, id } = agent;
  const teamSource = useMemo(
    () => ({
      fetch: () => host.team({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const team = useLoad<readonly AgentTeamMember[]>(teamSource).load;
  const toasts = useToastStore();
  // The card has no line of its own for a failed save, so it says so in a toast.
  const save = (change: AgentChange) =>
    host.update(agent, change).then(
      () => true,
      (error: unknown) => {
        toasts?.show({ tone: "danger", title: pageWords.couldntSave(errorReasonFor(error)) });
        return false;
      },
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {openAgent && (
        <p className="px-4 pt-4 text-small">
          <button type="button" className={inlineLinkClasses} onClick={() => openAgent(agent)}>
            {pageWords.openAgent(name)}
          </button>
        </p>
      )}
      {/* The chart only adds to the settings, so while it is read or can't be, it isn't there. */}
      {team.kind === "ready" && <TeamChart team={team.value} agent={agent} openAgent={openAgent} />}
      <Configuration
        host={host}
        name={name}
        load={settings.load}
        aliases={aliases.load}
        defaultModel={defaultModel}
        retryAliases={aliases.retry}
        retry={settings.retry}
        save={save}
        openSubagent={openSubagent}
        announce={announce}
        narrow
      />
    </div>
  );
}
