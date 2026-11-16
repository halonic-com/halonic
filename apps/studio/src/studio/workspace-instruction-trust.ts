import type { InstructionTrustService } from "@halonicjs/app";
import type { LoggedInstructionPin } from "@halonicjs/events";
import { type ErrorKind, errorKindOf } from "@halonicjs/std";
import type {
  InstructionTrustAnswer,
  InstructionTrustHost,
} from "@halonicjs/studio-feature-runs/api";

/**
 * Lets the run page ask a person to trust one agent's instructions in the open workspace
 * (`studio.workspace-instruction-trust`). The shell asks in its own dialog and saves only on a
 * yes, so the page can't trust anything by itself. Each shell refusal becomes one answer the
 * page words itself: the shell's own text is never passed on.
 *
 * @example
 * services.provide(InstructionTrustHostService, new WorkspaceInstructionTrust(trust, location));
 */
export class WorkspaceInstructionTrust implements InstructionTrustHost {
  readonly #trust: InstructionTrustService;
  readonly #location: string;

  constructor(trust: InstructionTrustService, location: string) {
    this.#trust = trust;
    this.#location = location;
  }

  async trust(agent: string, pin: LoggedInstructionPin): Promise<InstructionTrustAnswer> {
    try {
      await this.#trust.trust({ location: this.#location, agent }, pin);
      return "trusted";
    } catch (error) {
      return answerOfRefusal(errorKindOf(error));
    }
  }
}

function answerOfRefusal(kind: ErrorKind): InstructionTrustAnswer {
  if (kind === "denied") return "declined";
  if (kind === "conflict") return "busy";
  return "unavailable";
}
