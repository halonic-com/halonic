// Whether an agent's instructions are the ones a person trusted
// (`app.instruction-trust-service`): it reads the trusted pin from the
// store in the user's profile, compares it with the run's pin, and saves a
// new one only when a person says yes.

import {
  type Clock,
  type InstructionPin,
  type InstructionTrustKey,
  type InstructionTrustStore,
  isInstructionTrustFor,
} from "@halonicjs/ports";
import { type InstructionTrust, instructionTrust } from "./instruction-trust.ts";

/**
 * Whether the run may start with its instructions. When a person must be
 * asked, `unreadable` says why the trusted pin couldn't be used, if that is
 * the reason, so the prompt doesn't present a damaged record as a new agent.
 */
export type InstructionTrustCheck =
  | { readonly kind: "trusted" }
  | (Extract<InstructionTrust, { kind: "ask" }> & { readonly unreadable?: string });

/** What {@link InstructionTrustService} needs. */
export interface InstructionTrustServiceOptions {
  /** The trusted pins, in the user's profile and never in the workspace. */
  readonly store: InstructionTrustStore;
  readonly clock: Clock;
}

/**
 * Decides whether an agent's instructions are trusted, and records a
 * person's yes. Only a person's action may call {@link trust}: no tool the
 * model can call reaches this service.
 *
 * @example
 * const service = new InstructionTrustService({ store, clock });
 * const check = await service.check({ location, agent: "coder" }, pin);
 * if (check.kind === "ask") await service.trust({ location, agent: "coder" }, pin);
 */
export class InstructionTrustService {
  readonly #options: InstructionTrustServiceOptions;

  constructor(options: InstructionTrustServiceOptions) {
    this.#options = options;
  }

  /**
   * Compares `current` with the pin trusted for the agent. A record that
   * can't be read, or isn't the agent's, never counts as trust: the answer
   * is `ask`, with the reason.
   */
  async check(key: InstructionTrustKey, current: InstructionPin): Promise<InstructionTrustCheck> {
    let trusted: InstructionPin | null;
    try {
      trusted = await this.#trustedPin(key);
    } catch (error) {
      const unreadable = error instanceof Error ? error.message : String(error);
      const ask = instructionTrust(null, current);
      // `instructionTrust` gives `ask` whenever nothing is trusted.
      if (ask.kind !== "ask") throw new Error("Nothing trusted must ask.");
      return { ...ask, unreadable };
    }
    return instructionTrust(trusted, current);
  }

  /** Saves `pin` as what a person trusted for the agent, replacing any earlier pin. */
  async trust(key: InstructionTrustKey, pin: InstructionPin): Promise<void> {
    await this.#options.store.save({
      location: key.location,
      agent: key.agent,
      pin,
      grantedAt: this.#options.clock.now().toISOString(),
    });
  }

  /** Forgets what was trusted for the agent, so the next run asks. */
  async revoke(key: InstructionTrustKey): Promise<void> {
    await this.#options.store.remove(key);
  }

  async #trustedPin(key: InstructionTrustKey): Promise<InstructionPin | null> {
    const record = await this.#options.store.get(key);
    if (record === null) return null;
    // An adapter checks what it reads; the service checks again, as the port says.
    if (!isInstructionTrustFor(key, record)) {
      throw new Error(
        `The trusted instructions for the agent ${JSON.stringify(key.agent)} aren't valid.`,
      );
    }
    return record.pin;
  }
}
