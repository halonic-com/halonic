import type { RoutineRunAgentsProps } from "@halonicjs/studio-feature-routines/api";
import type { ComponentType } from "react";
import type { AgentsHost } from "../api.ts";
import { WHERE_IT_RUNS_STEP } from "../where-it-runs-step.ts";
import { ConfirmAgainCallouts } from "./confirm-again-callouts.tsx";

/**
 * The routine page's confirm-again Callouts (requirement `routines.page.confirm-again`), as the
 * Agents feature gives them to the Routines feature (`RoutineRunAgentsService`): one per agent
 * **Run now** starts whose On this computer choice is on hold, in the page's column under the
 * can't-run Callout. **Review and confirm** opens the agent at Where it runs.
 *
 * @example
 * const RoutineConfirmAgain = routineConfirmAgainOf(services.get(AgentsHostService));
 */
export function routineConfirmAgainOf(host: AgentsHost): ComponentType<RoutineRunAgentsProps> {
  return function RoutineConfirmAgain({ hubId, agents, openAgent }: RoutineRunAgentsProps) {
    return (
      <ConfirmAgainCallouts
        host={host}
        hubId={hubId}
        agents={agents}
        placement="column"
        reviewAndConfirm={
          openAgent && ((agentId: string) => openAgent(agentId, WHERE_IT_RUNS_STEP))
        }
      />
    );
  };
}
