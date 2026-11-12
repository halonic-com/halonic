// The files a plugin's backend was trusted with, checked again at every
// runner start (HAL-7896). The trust check hashed the folder, and the runner
// later runs the folder in place, so a change in between would run code the
// person never trusted. Before each start the folder must hold exactly the
// files the check saw, with the bytes it hashed. The runner is also started
// again after an idle stop, so this runs for every start, not only the first.

import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** One file the trust check hashed: its path from the plugin's folder with `/`, and the SHA-256 of its bytes in lowercase hex. */
export interface CheckedFile {
  readonly path: string;
  readonly sha256: string;
}

/** What the check reads from the disk. */
export interface CheckedFilesDisk {
  /**
   * Every entry under the folder that isn't a directory, at any depth, as a
   * path from the folder with `/`: a link or a special file is listed too, so
   * it can't slip past the check. Throws when it can't list it.
   */
  filesIn(folder: string): readonly string[];
  /** The SHA-256 of a plain file's bytes in lowercase hex; throws when it isn't a plain file or can't be read. */
  sha256Of(file: string): string;
}

/**
 * Walks the folder by hand, because a recursive `readdir` follows a link to
 * a directory, and a link back up would never end. A link is listed as an
 * entry and never entered.
 */
function entriesBelow(folder: string, below = ""): string[] {
  return readdirSync(join(folder, below), { withFileTypes: true }).flatMap((entry) => {
    const path = below === "" ? entry.name : `${below}/${entry.name}`;
    return entry.isDirectory() ? entriesBelow(folder, path) : [path];
  });
}

/** The disk the plugin is really on. */
export const checkedFilesOnThisMachine: CheckedFilesDisk = {
  filesIn: (folder) => entriesBelow(folder),
  sha256Of: (file) => {
    if (!lstatSync(file).isFile()) throw new Error("not a plain file");
    return createHash("sha256").update(readFileSync(file)).digest("hex");
  },
};

/**
 * What differs between the folder and the files that were checked: a file
 * that was added, removed or changed, by path. Empty when the folder is
 * exactly what was trusted. It names paths only, never contents.
 *
 * @example
 * checkedFilesProblems("/plugins/weather", checked.files);
 * // ["backend/index.js changed"]
 */
export function checkedFilesProblems(
  folder: string,
  checked: readonly CheckedFile[],
  disk: CheckedFilesDisk = checkedFilesOnThisMachine,
): string[] {
  let present: readonly string[];
  try {
    present = disk.filesIn(folder);
  } catch {
    return ["the folder can't be listed"];
  }
  const expected = new Map(checked.map((file) => [file.path, file.sha256]));
  const problems = present.filter((path) => !expected.has(path)).map((path) => `${path} was added`);
  for (const [path, sha256] of expected) {
    if (!present.includes(path)) {
      problems.push(`${path} is missing`);
      continue;
    }
    try {
      if (disk.sha256Of(join(folder, path)) !== sha256) problems.push(`${path} changed`);
    } catch {
      problems.push(`${path} can't be read`);
    }
  }
  return problems;
}
