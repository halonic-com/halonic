// The instructions of a harness run, taken from the agent's file (HAL-3106):
// its `instructions` as `AGENTS.md`, and each selected skill as
// `skills/<id>/SKILL.md`. They are copied into a folder of the run's own and
// the engine is given their pin, so the run log names what the run had.

import { mkdir } from "node:fs/promises";
import type {
  HarnessAgent,
  HarnessInstructionSource,
  HarnessInstructionsPin,
} from "@halonicjs/engine";
import {
  type InstructionDisk,
  type InstructionFile,
  type InstructionPin,
  instructionDiskOnThisComputer,
  snapshotInstructions,
} from "./instruction-snapshot.ts";

/** What {@link RunInstructions} needs from the host. */
export interface RunInstructionsOptions {
  /** The text of a skill's `SKILL.md`, as the run's workspace has it. Throws when there is none. */
  skillTextOf(agent: HarnessAgent, skillId: string): Promise<string>;
  /** The folder that holds the runs' instruction folders, in Halonic's data folder; made when it isn't there. */
  readonly root: string;
  readonly disk?: InstructionDisk;
}

/**
 * Copies a run's instructions into a new read-only folder and gives their pin.
 *
 * @example
 * const source = new RunInstructions({ skillTextOf, root });
 * const pin = await source.pinOf(agent); // null when the agent has no instructions and no skills
 */
export class RunInstructions implements HarnessInstructionSource {
  readonly #options: RunInstructionsOptions;

  constructor(options: RunInstructionsOptions) {
    this.#options = options;
  }

  /** @throws when a skill has no text, a name is refused, or the files can't be written */
  async pinOf(agent: HarnessAgent): Promise<HarnessInstructionsPin | null> {
    const files = await this.#filesOf(agent);
    if (files.length === 0) return null;
    const disk = this.#options.disk ?? instructionDiskOnThisComputer;
    await mkdir(this.#options.root, { recursive: true, mode: 0o700 });
    const snapshot = await snapshotInstructions(this.#options.root, files, disk);
    return engineFormOf(snapshot.pin);
  }

  async #filesOf(agent: HarnessAgent): Promise<InstructionFile[]> {
    const files: InstructionFile[] = [];
    if (agent.file.instructions.trim() !== "") {
      files.push({ name: "AGENTS.md", text: agent.file.instructions });
    }
    for (const id of agent.file.skills) {
      files.push({
        name: `skills/${id}/SKILL.md`,
        text: await this.#options.skillTextOf(agent, id),
      });
    }
    return files;
  }
}

/** The pin as the run log has it: a list of files with their digests. */
function engineFormOf(pin: InstructionPin): HarnessInstructionsPin {
  return {
    files: Object.entries(pin.files).map(([path, sha256]) => ({ path, sha256 })),
    sha256: pin.digest,
  };
}
