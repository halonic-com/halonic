// The instructions a harness step starts with on the Worker (requirement
// `runtime.worker-instructions`): the agent's `AGENTS.md` and its skills, from the
// run-definitions index of the snapshot this Worker version serves, pinned with Web
// Crypto. The Worker has no disk to copy them to, so it gives the files themselves;
// the Claude Code wrapper writes them into the run's container, read-only, before
// the program starts.

import type {
  HarnessAgent,
  HarnessInstructionSource,
  HarnessInstructionsPin,
  OpenInstructions,
} from "@halonicjs/engine";
import type { Skill } from "@halonicjs/format";
import { contentDigest, type Sha256 } from "@halonicjs/std";
import { indexedHub, type RunDefinitionsIndexReader } from "./indexed-run-definitions.ts";

/** Where a harness step's instructions go in the run's container; the profile opens it read-only. */
export const workerInstructionsFolder = "/halonic/temp/instructions";

/** One instruction file: its name inside the instructions folder, and its text. */
export interface WorkerInstructionFile {
  /** `AGENTS.md`, or `skills/<id>/SKILL.md`. */
  readonly name: string;
  readonly text: string;
}

/** A step's instructions on the Worker: the pin and folder the engine gets, and the files to write there. */
export interface WorkerOpenInstructions extends OpenInstructions {
  /** What the wrapper writes into {@link workerInstructionsFolder}, the very texts the pin names. */
  readonly files: readonly WorkerInstructionFile[];
}

/** A skill id that is one plain folder name: no `/`, no `.` or `..`, nothing a path would read otherwise. */
const plainSkillId = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/u;

/** Web Crypto's SHA-256, which the Worker has, unlike `node:crypto`. */
const webSha256: Sha256 = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/**
 * The Worker's instruction source: an agent's instructions as `AGENTS.md` and each
 * selected skill as `skills/<id>/SKILL.md`, read from the snapshot's index.
 *
 * @example
 * const source = new WorkerInstructions(readIndex);
 * const open = await source.open(agent); // null when the agent has no instructions and no skills
 * open?.files; // [{ name: "AGENTS.md", text: "Be brief." }, …]
 */
export class WorkerInstructions implements HarnessInstructionSource {
  readonly #readIndex: RunDefinitionsIndexReader;

  /** @param readIndex - the snapshot's index, from `cachedRunDefinitionsIndex` */
  constructor(readIndex: RunDefinitionsIndexReader) {
    this.#readIndex = readIndex;
  }

  /**
   * @throws RunTargetNotFound for a hub the index doesn't have, and an Error for a
   *   skill the hub doesn't have or whose id isn't a plain folder name
   */
  async open(agent: HarnessAgent): Promise<WorkerOpenInstructions | null> {
    const files = await this.#filesOf(agent);
    if (files.length === 0) return null;
    return {
      pin: await pinOf(files),
      folder: workerInstructionsFolder,
      files,
      // The folder is in the run's container, which goes with the run; there is nothing to remove here.
      release: async () => undefined,
    };
  }

  async #filesOf(agent: HarnessAgent): Promise<WorkerInstructionFile[]> {
    const files: WorkerInstructionFile[] = [];
    if (agent.file.instructions.trim() !== "") {
      files.push({ name: "AGENTS.md", text: agent.file.instructions });
    }
    if (agent.file.skills.length === 0) return files;
    const { skills } = await indexedHub(this.#readIndex, agent.hubId);
    // A skill selected twice is written once: the folder can hold only one file of a name.
    for (const id of new Set(agent.file.skills)) {
      if (!plainSkillId.test(id)) {
        throw new Error(`The skill id "${id}" isn't a plain folder name.`);
      }
      const skill = Object.hasOwn(skills, id) ? skills[id] : undefined;
      if (skill === undefined) {
        throw new Error(`The hub "${agent.hubId}" has no skill "${id}" in the deployed workspace.`);
      }
      files.push({ name: `skills/${id}/SKILL.md`, text: skillText(skill) });
    }
    return files;
  }
}

/**
 * A skill's `SKILL.md` as the index has it: its name and description as front matter,
 * then its body. The index keeps the parsed skill, not the file's bytes, so this pin
 * can differ from one taken of the file on a computer; nobody trusts instructions on
 * the Worker, so no trusted pin is compared with it.
 */
function skillText(skill: Skill): string {
  // A JSON string is a YAML double-quoted scalar, so any name or description stays one line of text.
  const frontMatter = `name: ${JSON.stringify(skill.name)}\ndescription: ${JSON.stringify(skill.description)}`;
  return `---\n${frontMatter}\n---\n\n${skill.body}\n`;
}

/** The pin as `pinInstructions` of the harness kit takes it: each file's digest, and the digest of their sorted listing. */
async function pinOf(files: readonly WorkerInstructionFile[]): Promise<HarnessInstructionsPin> {
  const digests = new Map<string, string>();
  for (const file of files) digests.set(file.name, await contentDigest(file.text, webSha256));
  // By code unit, never by locale, as the harness kit sorts them.
  const names = [...digests.keys()].sort((left, right) => (left < right ? -1 : 1));
  const listing = names.map((name) => `${JSON.stringify(name)} ${digests.get(name)}\n`).join("");
  return {
    files: names.map((path) => ({ path, sha256: digests.get(path) as string })),
    sha256: await contentDigest(listing, webSha256),
  };
}
