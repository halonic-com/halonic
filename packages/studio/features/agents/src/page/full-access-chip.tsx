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

/** The chip's look and words while the choice holds, and while it is on hold. */
const chips = {
  "this-computer": { tone: "attention", label: words.fullAccess, spoken: words.fullAccessSpoken },
  "on-hold": {
    tone: "neutral",
    label: words.fullAccessOnHold,
    spoken: words.fullAccessOnHoldSpoken,
  },
} as const;

/**
 * The `Full access` chip in the agent page's header (`agents.page.full-access-chip`; checklist
 * 3.8): an attention (amber) chip with the shield, while On this computer is chosen for the agent on this
 * computer. While that choice is on hold after the file changed, the chip stays, since the choice
 * is held, not dropped, but turns neutral and says `Full access on hold`: the agent runs in its
 * sandbox until the person confirms again (HAL-15640). It is read again when a file changes, as
 * Where it runs is. Where the host can't say, or the read fails, there is no chip: Where it runs
 * says why.
 */
export function FullAccessChip({ host, agent }: FullAccessChipProps) {
  const { load } = usePlacement(host, agent.hubId, agent.id);
  if (load.kind !== "loaded" || load.placement.runsOn === "sandbox") return null;
  const chip = chips[load.placement.runsOn];
  return (
    <StatusChip tone={chip.tone}>
      <span className="size-3.5 shrink-0" aria-hidden="true">
        <ShieldIcon />
      </span>
      <span aria-hidden="true">{chip.label}</span>
      <span className="sr-only">{chip.spoken}</span>
    </StatusChip>
  );
}
