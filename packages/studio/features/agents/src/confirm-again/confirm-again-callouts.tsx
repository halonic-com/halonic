import { Callout } from "@halonicjs/studio-kit";
import type { AgentsHost } from "../api.ts";
import { configurationWords } from "../configuration/configuration-words.ts";
import { useOnHoldAgents } from "./use-on-hold-agents.ts";

const words = configurationWords.whereItRuns;

/** An agent a page's Run starts, as the page names it. */
export interface RunAgent {
  readonly id: string;
  readonly name: string;
}

/** Props for {@link ConfirmAgainCallouts}. */
export interface ConfirmAgainCalloutsProps {
  /** The workspace's agents host; without it (no agents feature) nothing is drawn. */
  readonly host: AgentsHost | undefined;
  readonly hubId: string;
  /** The agents the page's Run starts in a program of their own, in the page's order. */
  readonly agents: readonly RunAgent[];
  /**
   * Opens the agent's page at Configuration › Harness, where Where it runs holds the warning
   * (`openItem(agent, { step: WHERE_IT_RUNS_STEP })`). Without it the Callout has no button.
   */
  readonly reviewAndConfirm?: ((agentId: string) => void) | undefined;
  /**
   * Where the page draws them: a band of their own under its header (the workflow page), or in a
   * column that already has its margins and gaps (the routine page). A band by default.
   */
  readonly placement?: "band" | "column" | undefined;
}

const placementClass = {
  band: "flex flex-col gap-2 border-b border-border px-6 py-3 phone:px-4",
  column: "flex flex-col gap-3",
} as const;

/**
 * The run controls' confirm-again Callouts (requirement `agents.confirm-again.run-controls`,
 * microcopy 23.4 "File changed, run controls"): one per agent the page runs whose On this computer
 * choice is on hold, each with **Review and confirm**. A page draws them under its header, below
 * any can't-run Callout. They never disable Run: an agent on hold still runs, in its sandbox.
 *
 * @example
 * <ConfirmAgainCallouts host={agents} hubId="acme" agents={[{ id: "writer", name: "Writer" }]} />
 */
export function ConfirmAgainCallouts({
  host,
  hubId,
  agents,
  reviewAndConfirm,
  placement = "band",
}: ConfirmAgainCalloutsProps) {
  const onHold = useOnHoldAgents(
    host,
    hubId,
    agents.map((agent) => agent.id),
  );
  const shown = agents.filter((agent) => onHold.includes(agent.id));
  if (shown.length === 0) return null;
  return (
    <div className={placementClass[placement]}>
      {shown.map((agent) => (
        // Attention, as on the Harness page: the person is asked to act, nothing failed (C569).
        <Callout
          key={agent.id}
          tone="attention"
          {...(reviewAndConfirm && {
            action: { label: words.reviewAndConfirm, onClick: () => reviewAndConfirm(agent.id) },
          })}
        >
          {words.runControls(agent.name)}
        </Callout>
      ))}
    </div>
  );
}
