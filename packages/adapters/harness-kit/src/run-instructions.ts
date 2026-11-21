// The instructions of a harness run, taken from the agent's file (HAL-3106):
// its `instructions` as `AGENTS.md`, and each selected skill as
// `skills/<id>/SKILL.md`. They are copied into a folder of the run's own and
// the engine is given their pin, so the run log names what the run had.

import { mkdir } from "node:fs/promises";
import type {
  HarnessAgent,
  HarnessInstructionSource,
  HarnessInstructionsPin,
  OpenInstructions,
} from "@halonicjs/engine";
import type { InstructionPin } from "@halonicjs/ports";
import {
  type InstructionDisk,
  type InstructionFile,
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
 * Copies a run's instructions into a new read-only folder, and gives their
 * pin and the folder. Releasing removes the folder.
 *
 * @example
 * const source = new RunInstructions({ skillTextOf, root });
 * const open = await source.open(agent); // null when the agent has no instructions and no skills
 * try { start(open?.folder); } finally { await open?.release(); }
 */
export class RunInstructions implements HarnessInstructionSource {
  readonly #options: RunInstructionsOptions;

  constructor(options: RunInstructionsOptions) {
    this.#options = options;
  }

  /** @throws when a skill has no text, a name is refused, or the files can't be written */
  async open(agent: HarnessAgent): Promise<OpenInstructions | null> {
    const files = await this.#filesOf(agent);
    if (files.length === 0) return null;
    const disk = this.#options.disk ?? instructionDiskOnThisComputer;
    await mkdir(this.#options.root, { recursive: true, mode: 0o700 });
    const { folder, pin } = await snapshotInstructions(this.#options.root, files, disk);
    return {
      pin: engineFormOf(pin),
      folder,
      // A folder that can't be removed is left for the next engine open to clear.
      release: () => disk.removeFolder(folder).catch(() => undefined),
    };
  }

  #filesOf(agent: HarnessAgent): Promise<InstructionFile[]> {
    return instructionFilesOf(agent.file, (id) => this.#options.skillTextOf(agent, id));
  }
}

/**
 * The instruction files of an agent's file, as a harness run gets them: its
 * `instructions` as `AGENTS.md`, when there are any, and each selected skill
 * as `skills/<id>/SKILL.md`. `halonic trust instructions` pins the same
 * files, so what a person trusts is what the run's check sees.
 *
 * @param skillTextOf - the text of a skill's `SKILL.md`; throws when there is none
 * @returns no files when the agent has no instructions and no skills
 */
export async function instructionFilesOf(
  file: Pick<HarnessAgent["file"], "instructions" | "skills">,
  skillTextOf: (skillId: string) => Promise<string>,
): Promise<InstructionFile[]> {
  const files: InstructionFile[] = [];
  if (file.instructions.trim() !== "") {
    files.push({ name: "AGENTS.md", text: file.instructions });
  }
  for (const id of file.skills) {
    files.push({ name: `skills/${id}/SKILL.md`, text: await skillTextOf(id) });
  }
  return files;
}

/** The pin as the run log has it: a list of files with their digests. */
function engineFormOf(pin: InstructionPin): HarnessInstructionsPin {
  return {
    files: Object.entries(pin.files).map(([path, sha256]) => ({ path, sha256 })),
    sha256: pin.digest,
  };
}
