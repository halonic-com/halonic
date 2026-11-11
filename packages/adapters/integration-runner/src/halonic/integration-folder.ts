// The link check on a local integration's folder (design HAL-958, section 5,
// attack case A12). Node's permission model follows a symbolic link even to a
// place it wasn't allowed to read, so a link in the folder to `~/.ssh` would
// reach it on the path without the fence. The loader refuses such a folder
// before anything starts; on the fenced path srt would refuse the read too.
// A hard link gets past both: the fence goes by path, and the file's name in
// the folder is the outside file (HAL-4965). So the check refuses a file with
// a name outside the folder too. It walks Halonic's own process, so it stops
// after a fixed number of entries.

import { type Dirent, lstatSync, readdirSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import type { LoadProblem } from "@halonicjs/adapter-integration-kit";
import { isInsideOrSame } from "./runner-profile.ts";

/** One entry in a folder, without following it if it is a link. */
export interface FolderEntry {
  readonly name: string;
  readonly kind: "file" | "folder" | "link" | "other";
}

/** Which file a name stands for, and how many names that file has on its disk. */
export interface FileIdentity {
  /** The same for every name of one file, such as its device and inode. */
  readonly id: string;
  /** How many names the file has, in this folder or anywhere else; 1 unless it is hard-linked. */
  readonly names: number;
}

/** What the link check reads from the disk. */
export interface IntegrationFolderDisk {
  /** The entries in a folder; throws when it can't list it. */
  entries(folder: string): readonly FolderEntry[];
  /** The path with every link on it resolved; throws when it can't, such as a broken link. */
  realPath(path: string): string;
  /** Which file a name in the folder stands for, without following a link; throws when it can't. */
  identity(file: string): FileIdentity;
}

/** The most entries the check reads before it refuses the folder as too large. */
export const maxFolderEntries = 10_000;

/** The disk the integration is really on. */
export const integrationFolderOnThisMachine: IntegrationFolderDisk = {
  entries: (folder) =>
    readdirSync(folder, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      kind: kindOf(entry),
    })),
  realPath: (path) => realpathSync.native(path),
  identity: (file) => {
    const stats = lstatSync(file, { bigint: true });
    return { id: `${stats.dev}:${stats.ino}`, names: Number(stats.nlink) };
  },
};

/**
 * Every link in the integration's folder, at any depth, that leads out of
 * the folder or nowhere: a symbolic link, or a file with a name outside the
 * folder (a hard link). A symbolic link that stays inside, such as the ones a
 * package manager puts in `node_modules`, is allowed, and so is a file whose
 * every name is in the folder. Links are never followed while looking, so a
 * loop can't keep the check going. A folder with more than
 * {@link maxFolderEntries} entries is refused as `folder-too-large`.
 *
 * @example
 * folderLinkProblems("weather", "/work/integrations/weather");
 * // [{ code: "link-out-of-folder", path: [], message: "weather: its folder holds a link out of it, keys" }]
 */
export function folderLinkProblems(
  id: string,
  folder: string,
  disk: IntegrationFolderDisk = integrationFolderOnThisMachine,
): LoadProblem[] {
  let realFolder: string;
  try {
    realFolder = disk.realPath(folder);
  } catch (error) {
    return [problem(id, "folder-unreadable", `can't find its folder ${folder}`, error)];
  }
  const problems: LoadProblem[] = [];
  const hardLinked = new HardLinkedFiles();
  let entriesRead = 0;
  const look = (current: string) => {
    for (const entry of disk.entries(current)) {
      entriesRead += 1;
      if (entriesRead > maxFolderEntries) throw new FolderTooLarge();
      const path = join(current, entry.name);
      if (entry.kind === "folder") {
        look(path);
      } else if (entry.kind === "file") {
        hardLinked.note(path, disk.identity(path));
      } else if (entry.kind === "link" && !leadsInside(path, realFolder, disk)) {
        const where = relative(realFolder, path);
        problems.push(
          problem(id, "link-out-of-folder", `its folder holds a link out of it, ${where}`),
        );
      }
    }
  };
  try {
    look(realFolder);
  } catch (error) {
    if (error instanceof FolderTooLarge) {
      return [
        {
          ...problem(
            id,
            "folder-too-large",
            `its folder holds more than ${maxFolderEntries} entries`,
          ),
          fix: "Keep only the integration's code and Zod in its folder.",
        },
      ];
    }
    return [problem(id, "folder-unreadable", "can't read its whole folder", error)];
  }
  for (const file of hardLinked.withNamesOutside()) {
    problems.push({
      ...problem(
        id,
        "hard-link-out-of-folder",
        `its folder holds a hard link to a file outside it, ${relative(realFolder, file)}`,
      ),
      fix: "Copy the file into the folder instead of linking it; for packages, install with npm or with pnpm's `package-import-method=copy`.",
    });
  }
  return problems;
}

/** Thrown to end the walk once the folder holds more than {@link maxFolderEntries} entries. */
class FolderTooLarge extends Error {}

/**
 * The files in the folder that have more than one name, by identity. A file
 * whose names are all in the folder is fine; one with a name the walk never
 * met has that name somewhere outside, and reading it here reads it there.
 */
class HardLinkedFiles {
  readonly #files = new Map<string, { readonly names: number; readonly paths: string[] }>();

  note(path: string, identity: FileIdentity): void {
    if (identity.names <= 1) return;
    const file = this.#files.get(identity.id);
    if (file === undefined) {
      this.#files.set(identity.id, { names: identity.names, paths: [path] });
    } else {
      file.paths.push(path);
    }
  }

  /** Every name in the folder of a file that also has a name outside it. */
  withNamesOutside(): string[] {
    return [...this.#files.values()]
      .filter((file) => file.paths.length < file.names)
      .flatMap((file) => file.paths);
  }
}

function leadsInside(link: string, realFolder: string, disk: IntegrationFolderDisk): boolean {
  try {
    return isInsideOrSame(disk.realPath(link), realFolder);
  } catch {
    // A broken link leads nowhere yet, and could lead anywhere later.
    return false;
  }
}

function problem(
  id: string,
  code: "link-out-of-folder" | "hard-link-out-of-folder" | "folder-too-large" | "folder-unreadable",
  what: string,
  cause?: unknown,
): LoadProblem {
  const detail = cause instanceof Error ? `: ${cause.message}` : "";
  return { code, path: [], message: `${id}: ${what}${detail}` };
}

function kindOf(entry: Dirent): FolderEntry["kind"] {
  if (entry.isSymbolicLink()) return "link";
  if (entry.isDirectory()) return "folder";
  if (entry.isFile()) return "file";
  return "other";
}
