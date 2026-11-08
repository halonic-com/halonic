import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { listFiles, type ParityCase } from "./cases.ts";

function copyInto(from: string, to: string, files: readonly string[]): void {
  for (const file of files) {
    mkdirSync(dirname(join(to, file)), { recursive: true });
    copyFileSync(join(from, file), join(to, file));
  }
}

/**
 * Builds the workspace a case describes in `target`: the base files, then the
 * case's own files on top (same path replaces), then its removals.
 * Returns the workspace's files, sorted.
 *
 * @throws when a removal names a file that isn't there, so a typo can't turn a
 *   "missing file" case into a copy of the base
 */
export function composeWorkspace(
  fixtures: string,
  parityCase: ParityCase,
  target: string,
): string[] {
  const baseFiles = join(fixtures, "base", "files");
  mkdirSync(target, { recursive: true });
  copyInto(baseFiles, target, listFiles(baseFiles));
  if (parityCase.id !== "base") {
    copyInto(join(parityCase.folder, "files"), target, parityCase.files);
  }
  for (const file of parityCase.remove) {
    const path = join(target, file);
    if (!existsSync(path)) {
      throw new Error(
        `case ${parityCase.id}: cannot remove "${file}", the workspace has no such file`,
      );
    }
    rmSync(path);
  }
  return listFiles(target);
}
