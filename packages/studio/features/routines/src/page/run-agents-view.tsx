import { loadView, type ViewRef } from "@halonicjs/studio-shell";
import { type ComponentType, useEffect, useState } from "react";
import type { RoutineTarget } from "../api.ts";
import type { RoutineProgramAgent, RoutineRunAgentsProps } from "../run-agents-api.ts";

/** Names an agent: the hub it is in and its id. */
export interface AgentRef {
  readonly hubId: string;
  readonly id: string;
}

/** Props for {@link RunAgentsView}. */
export interface RunAgentsViewProps {
  /** The view `RoutineRunAgentsService` gives; without it (no Agents feature) nothing is drawn. */
  readonly view: ViewRef | undefined;
  /** What Run now starts; its agents are in its hub, which can differ from the routine's own. */
  readonly target: RoutineTarget;
  /** The agents Run now starts in a program of their own. */
  readonly agents: readonly RoutineProgramAgent[];
  /** Opens an agent's page, at `step` when given; without it the view offers no way there. */
  readonly openAgent?: ((agent: AgentRef, step?: string) => void) | undefined;
}

/**
 * The view another feature gives about the agents **Run now** starts, such as the confirm-again
 * Callout (`routines.page.confirm-again`), for the agents in the target's hub. Nothing is drawn
 * while it loads, if it can't load, or for a routine that runs no agent in a program of its own: it
 * only adds a note, and Run now works without it.
 */
export function RunAgentsView({ view, target, agents, openAgent }: RunAgentsViewProps) {
  const [View, setView] = useState<ComponentType<RoutineRunAgentsProps> | null>(null);
  useEffect(() => {
    if (view === undefined) return;
    let current = true;
    loadView<ComponentType<RoutineRunAgentsProps>>(view).then(
      (loaded) => current && setView(() => loaded),
      (error: unknown) =>
        console.error("Couldn't load the note about the routine's agents.", error),
    );
    return () => {
      current = false;
    };
  }, [view]);
  if (View === null || agents.length === 0) return null;
  const hubId = target.hubId;
  return (
    <View
      hubId={hubId}
      agents={agents}
      openAgent={openAgent && ((id: string, step?: string) => openAgent({ hubId, id }, step))}
    />
  );
}
