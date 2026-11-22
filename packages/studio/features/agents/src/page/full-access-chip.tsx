import { ShieldIcon, StatusChip } from "@halonicjs/studio-kit";
import type { AgentRef, AgentsHost } from "../api.ts";
import { configurationWords } from "../configuration/configuration-words.ts";
import { usePlacement } from "../configuration/use-placement.ts";

const words = configurationWords.whereItRuns;

/** Props for {@link FullAccessChip}. */
export interface FullAccessChipProps {
  readonly host: AgentsHost;
  readonly agent: AgentRef;
}

/**
 * The `Full access` chip in the agent page's header (`agents.page.full-access-chip`; checklist
 * 3.8): an attention (amber) chip with the shield, while On this computer is chosen for the agent on this
 * computer. It stays while that choice is on hold after the file changed, since the choice is held,
 * not dropped. It is read again when a file changes, as Where it runs is. Where the host can't
 * say, or the read fails, there is no chip: Where it runs says why.
 */
export function FullAccessChip({ host, agent }: FullAccessChipProps) {
  const { load } = usePlacement(host, agent.hubId, agent.id);
  if (load.kind !== "loaded" || load.placement.runsOn === "sandbox") return null;
  const spoken =
    load.placement.runsOn === "on-hold" ? words.fullAccessOnHoldSpoken : words.fullAccessSpoken;
  return (
    <StatusChip tone="attention">
      <span className="size-3.5 shrink-0" aria-hidden="true">
        <ShieldIcon />
      </span>
      <span aria-hidden="true">{words.fullAccess}</span>
      <span className="sr-only">{spoken}</span>
    </StatusChip>
  );
}
