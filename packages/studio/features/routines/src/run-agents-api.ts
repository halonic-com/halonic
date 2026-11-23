import { type ServiceKey, serviceKey, type ViewRef } from "@halonicjs/studio-shell";

/** An agent a routine's **Run now** starts in a program of its own (Claude Code or Codex). */
export interface RoutineProgramAgent {
  readonly id: string;
  /** Its name, as its file gives it; its id when the file has none. */
  readonly name: string;
}

/** What the routine page gives the view of {@link RoutineRunAgentsService}. */
export interface RoutineRunAgentsProps {
  /**
   * The hub the agents are in: the target's (`target.hubId`), which can differ from the routine's
   * own when its file names another hub.
   */
  readonly hubId: string;
  /** The agents **Run now** starts in a program of their own, each once, in the routine's order. */
  readonly agents: readonly RoutineProgramAgent[];
  /**
   * Opens an agent's page, at `step` when given (as `openItem`'s `step`); without it the view
   * offers no way there.
   */
  readonly openAgent?: ((agentId: string, step?: string) => void) | undefined;
}

/**
 * A view another feature draws on a routine's page under the can't-run Callout, about the agents
 * its **Run now** starts, such as the Agents feature's confirm-again Callout for an agent on hold
 * (`routines.page.confirm-again`). Its component takes {@link RoutineRunAgentsProps}. The Routines
 * feature can't use the Agents feature itself, which already uses it, so the Agents feature gives
 * the view here (`routines.run-agents`).
 */
export const RoutineRunAgentsService: ServiceKey<ViewRef> =
  serviceKey<ViewRef>("routines.run-agents");
