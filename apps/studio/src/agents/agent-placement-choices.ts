import type { AgentPlacement, PlacementSubject } from "@halonicjs/app";
import type {
  AgentRef,
  SavedFilePlacement,
  ThisComputerChoice,
} from "@halonicjs/studio-feature-agents/api";

/** What {@link AgentPlacementChoices} reads and changes. */
export interface AgentPlacementParts {
  /** The person's choices on this computer, kept in the agent host's profile. */
  readonly placement: AgentPlacement;
  /** The workspace's real path, which choices are keyed by, as the engine keys them. */
  readonly location: string;
  /**
   * The agent's file as it is saved, the bytes the engine and `halonic run` hash, never the
   * unsaved text. Throws when the hub has no such agent.
   */
  bytesOf(ref: AgentRef): Promise<Uint8Array>;
  /**
   * Whether this Studio's runs can start an agent outside its sandbox, as its harness host says
   * (`studioStartsUnfenced`); it can't when left out.
   */
  readonly studioStartsUnfenced?: boolean;
}

/**
 * Where each agent runs on this computer, for the Harness page (requirement
 * `studio.agent-placement-choices`). It reads and saves through `AgentPlacement`, so the page,
 * the engine and the CLI see the same choice, and a choice is for the agent's saved file as the
 * person saw it in the warning.
 *
 * @example
 * const choices = new AgentPlacementChoices({ placement, location, bytesOf });
 * await choices.where({ hubId: "acme", id: "writer" }); // { runsOn: "sandbox", fingerprint: "sha256:…" }
 */
export class AgentPlacementChoices {
  readonly #parts: AgentPlacementParts;

  constructor(parts: AgentPlacementParts) {
    this.#parts = parts;
  }

  /** Whether this Studio can itself start an agent set to On this computer. */
  get studioStartsUnfenced(): boolean {
    return this.#parts.studioStartsUnfenced ?? false;
  }

  /** Where the agent runs; a choice for an earlier version of its file is on hold. */
  async where(ref: AgentRef): Promise<SavedFilePlacement> {
    const answer = await this.#parts.placement.where(await this.#subjectOf(ref));
    const fingerprint = answer.agentFingerprint;
    if (answer.runsOn === "this-computer") {
      return { runsOn: "this-computer", fingerprint, chosenAt: answer.chosenAt };
    }
    // A choice that can't be read leaves the agent in its sandbox, so the page says so.
    return answer.reason === "file-changed"
      ? { runsOn: "on-hold", fingerprint }
      : { runsOn: "sandbox", fingerprint };
  }

  /** Saves On this computer for the file the person was warned about; nothing when it changed since. */
  async chooseThisComputer(ref: AgentRef, shownFingerprint: string): Promise<ThisComputerChoice> {
    const chosen = await this.#parts.placement.chooseThisComputer(
      await this.#subjectOf(ref),
      shownFingerprint,
    );
    return chosen.ok
      ? { saved: true }
      : { saved: false, fingerprint: chosen.error.agentFingerprint };
  }

  /** Forgets the choice, so the agent runs in its sandbox again. */
  async chooseSandbox(ref: AgentRef): Promise<void> {
    await this.#parts.placement.chooseSandbox({
      location: this.#parts.location,
      hub: ref.hubId,
      agent: ref.id,
    });
  }

  /** The agent as `AgentPlacement` asks about it: keyed by its hub and id, as the engine asks. */
  async #subjectOf(ref: AgentRef): Promise<PlacementSubject> {
    return {
      location: this.#parts.location,
      hub: ref.hubId,
      agent: ref.id,
      file: await this.#parts.bytesOf(ref),
    };
  }
}

/**
 * The choices where this Studio can make them; throws where it can't (no agent host, as in the
 * browser), as the Harness page never offers the choice there.
 */
export function choicesHere(choices: AgentPlacementChoices | undefined): AgentPlacementChoices {
  if (choices === undefined) {
    throw new Error("Halonic can't choose where agents run from here.");
  }
  return choices;
}
