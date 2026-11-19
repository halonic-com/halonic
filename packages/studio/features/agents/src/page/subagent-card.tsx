import { useToastStore } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import type { AgentChange, AgentListing, AgentRef, AgentsHost } from "../api.ts";
import { Configuration } from "../configuration/configuration.tsx";
import { useConfigurationLoads } from "../configuration/use-configuration-loads.ts";
import { pageWords } from "./page-words.ts";

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
}

/**
 * A subagent's card on the agent page (flow-agents 5.4 and 7): the subagent's own Configuration in
 * the narrow panel, so its settings can be read and changed without leaving the agent it works for.
 * Its subagents open as cards on top of it.
 */
export function SubagentCard({ host, agent, name, openSubagent }: SubagentCardProps) {
  const { settings, aliases, defaultModel } = useConfigurationLoads(host, agent);
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
      narrow
    />
  );
}
