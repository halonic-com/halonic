// The link check on a local integration's folder (design HAL-958, section 5,
// attack case A12). Node's permission model follows a symbolic link even to a
// place it wasn't allowed to read, so a link in the folder to `~/.ssh` would
// reach it on the path without the fence. The loader refuses such a folder
// before anything starts; on the fenced path srt would refuse the read too.

import { type Dirent, readdirSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import type { LoadProblem } from "@halonicjs/adapter-integration-kit";
import { isInsideOrSame } from "./runner-profile.ts";

/** One entry in a folder, without following it if it is a link. */
export interface FolderEntry {
  readonly name: string;
  readonly kind: "file" | "folder" | "link" | "other";
}

/** What the link check reads from the disk. */
export interface IntegrationFolderDisk {
  /** The entries in a folder; throws when it can't list it. */
  entries(folder: string): readonly FolderEntry[];
  /** The path with every link on it resolved; throws when it can't, such as a broken link. */
  realPath(path: string): string;
}

/** The disk the integration is really on. */
export const integrationFolderOnThisMachine: IntegrationFolderDisk = {
  entries: (folder) =>
    readdirSync(folder, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      kind: kindOf(entry),
    })),
  realPath: (path) => realpathSync.native(path),
};

/**
 * Every symbolic link in the integration's folder, at any depth, that leads
 * out of the folder or nowhere. A link that stays inside, such as the ones a
 * package manager puts in `node_modules`, is allowed. Links are never
 * followed while looking, so a loop can't keep the check going.
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
  const look = (current: string) => {
    for (const entry of disk.entries(current)) {
      const path = join(current, entry.name);
      if (entry.kind === "folder") {
        look(path);
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
    return [problem(id, "folder-unreadable", "can't read its whole folder", error)];
  }
  return problems;
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
  code: "link-out-of-folder" | "folder-unreadable",
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
