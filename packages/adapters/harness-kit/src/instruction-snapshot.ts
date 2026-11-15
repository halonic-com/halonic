// The instructions a harness run starts with (HAL-3106): the agent's
// `AGENTS.md` and its selected skills, copied into the run's own folder,
// read-only, and pinned by content hash. The pin goes in the run log, so a
// review can tell which instructions a run had, and a person is asked again
// when the text behind a trusted pin has changed (the same idea as the
// workspace trust check).

import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { contentDigest, type Sha256 } from "@halonicjs/std";

/** One instruction file: its name inside the instructions folder, and its text. */
export interface InstructionFile {
  /** Relative, with `/`, such as `AGENTS.md` or `skills/review/SKILL.md`. */
  readonly name: string;
  readonly text: string;
}

/** What a run's instructions were: a digest per file, and one digest for all of them. */
export interface InstructionPin {
  /** The digest of the whole set, so two runs with the same instructions share it. */
  readonly digest: string;
  /** Each file's `sha256:` digest, by file name. */
  readonly files: Readonly<Record<string, string>>;
}

/** How a set of instructions differs from a trusted pin. */
export interface InstructionChanges {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
}

/** Whether the run may start with its instructions, or a person must trust them first. */
export type InstructionTrust =
  | { readonly kind: "trusted" }
  | { readonly kind: "ask"; readonly changes: InstructionChanges };

/** Where the copies are written: this computer's disk, or a fake in tests. */
export interface InstructionDisk {
  /** Writes a new file, creating its folder, that nobody can change afterwards. Throws when it already exists. */
  writeReadOnly(path: string, text: string): Promise<void>;
  /** Makes a new, empty folder only the user's, named `prefix` and a random end, and gives its path. */
  makeFreshFolder(prefix: string): Promise<string>;
  /** Removes a folder and the read-only files in it; a folder that isn't there is fine. */
  removeFolder(path: string): Promise<void>;
}

/** This computer's disk. The mode means little on Windows, where the sandbox's read-only rule is what holds. */
export const instructionDiskOnThisComputer: InstructionDisk = {
  async writeReadOnly(path, text) {
    await mkdir(dirname(path), { recursive: true });
    // `wx`: a run's folder is new, so a file that is there is a mistake, never a rewrite.
    await writeFile(path, text, { encoding: "utf8", flag: "wx", mode: 0o444 });
    await chmod(path, 0o444);
  },
  // `mkdtemp` makes the folder with mode 700. On Windows the mode means nothing.
  makeFreshFolder: (prefix) => mkdtemp(prefix),
  async removeFolder(path) {
    // Node clears a read-only file's flag on Windows when removing it, so the copies can go.
    await rm(path, { recursive: true, force: true, maxRetries: 3 });
  },
};

const nodeSha256: Sha256 = {
  async sha256(data) {
    return new Uint8Array(createHash("sha256").update(data).digest());
  },
};

/**
 * The pin of a set of instruction files. The order of `files` doesn't matter.
 *
 * @throws when a name isn't a plain relative name, or two files share one
 *   (names that differ only in letter case count as one, as on Windows and macOS)
 *
 * @example
 * const pin = await pinInstructions([{ name: "AGENTS.md", text: "Be brief.\n" }]);
 * pin.files["AGENTS.md"]; // "sha256:…"
 */
export async function pinInstructions(files: readonly InstructionFile[]): Promise<InstructionPin> {
  const digests = new Map<string, string>();
  const seen = new Set<string>();
  for (const file of files) {
    const problem = nameProblem(file.name);
    if (problem !== null) throw new Error(`Instruction file '${file.name}' ${problem}.`);
    if (seen.has(file.name.toLowerCase())) {
      throw new Error(`Instruction file '${file.name}' is there twice.`);
    }
    seen.add(file.name.toLowerCase());
    digests.set(file.name, await contentDigest(file.text, nodeSha256));
  }
  // By code unit, never by locale, so every computer pins the same set the same way.
  const names = [...digests.keys()].sort((left, right) => (left < right ? -1 : 1));
  const listing = names.map((name) => `${JSON.stringify(name)} ${digests.get(name)}\n`).join("");
  return {
    digest: await contentDigest(listing, nodeSha256),
    files: Object.fromEntries(names.map((name) => [name, digests.get(name) as string])),
  };
}

/**
 * Whether `current` is what a person trusted. With no trusted pin, or any
 * difference, they are asked, and the answer says what changed.
 */
export function instructionTrust(
  trusted: InstructionPin | null,
  current: InstructionPin,
): InstructionTrust {
  if (trusted !== null && trusted.digest === current.digest) return { kind: "trusted" };
  const before = trusted?.files ?? {};
  const names = (pin: Readonly<Record<string, string>>) => Object.keys(pin);
  // `hasOwn`, because a file may be named `constructor` or `toString`.
  const had = (name: string) => Object.hasOwn(before, name);
  const has = (name: string) => Object.hasOwn(current.files, name);
  return {
    kind: "ask",
    changes: {
      added: names(current.files).filter((name) => !had(name)),
      removed: names(before).filter((name) => !has(name)),
      changed: names(current.files).filter(
        (name) => had(name) && before[name] !== current.files[name],
      ),
    },
  };
}

/**
 * Copies the instructions into `folder`, read-only, and gives their pin.
 * The pin is taken from the text that is written, not from the source, so
 * the log can't name instructions the run didn't get.
 *
 * @param folder - the run's own instructions folder, new and empty
 */
export async function copyInstructions(
  folder: string,
  files: readonly InstructionFile[],
  disk: InstructionDisk = instructionDiskOnThisComputer,
): Promise<InstructionPin> {
  const pin = await pinInstructions(files);
  for (const file of files)
    await disk.writeReadOnly(join(folder, ...file.name.split("/")), file.text);
  return pin;
}

/** A run's instructions as they were written: where, and what they were. */
export interface InstructionSnapshot {
  /** The run's own new folder; the files are in it under their names. */
  readonly folder: string;
  readonly pin: InstructionPin;
}

/**
 * Copies the instructions into a new folder of the run's own, made in `root`.
 * When any file can't be written, the folder is removed again, so a run never
 * starts with part of its instructions.
 *
 * @param root - the run's folder in Halonic's data folder, where the new folder goes
 * @throws the first error, whether from the names or from the disk
 */
export async function snapshotInstructions(
  root: string,
  files: readonly InstructionFile[],
  disk: InstructionDisk = instructionDiskOnThisComputer,
): Promise<InstructionSnapshot> {
  // Names are checked before the folder is made, so a bad name leaves nothing behind.
  await pinInstructions(files);
  const folder = await disk.makeFreshFolder(join(root, "instructions-"));
  try {
    return { folder, pin: await copyInstructions(folder, files, disk) };
  } catch (error) {
    // The copy's own error is the one worth reporting; a leftover folder is only noted in its message.
    await disk.removeFolder(folder).catch(() => undefined);
    throw error;
  }
}

/** One line for the run log: which instructions the run had. */
export function describeInstructionPin(pin: InstructionPin): string {
  const count = Object.keys(pin.files).length;
  return `instructions ${pin.digest} (${count} ${count === 1 ? "file" : "files"})`;
}

/** Names Windows reads as a device, whatever the extension. */
const windowsDeviceNames = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/iu;

/** Letters, digits, `_` and `-`, with dots inside: no `:`, spaces or trailing dot that Windows treats specially. */
const plainSegment = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/u;

/** Why a name can't be an instruction file's, or `null`. */
function nameProblem(name: string): string | null {
  if (name === "") return "has no name";
  for (const part of name.split("/")) {
    if (!plainSegment.test(part) || part.endsWith(".")) return "isn't a plain relative name";
    if (windowsDeviceNames.test(part.split(".")[0] as string)) {
      return "has a name Windows reserves for a device";
    }
  }
  return null;
}
