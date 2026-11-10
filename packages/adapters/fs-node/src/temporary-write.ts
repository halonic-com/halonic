import { randomUUID } from "node:crypto";

/**
 * Names of the temporary files a write renames into place. `list()` and the
 * watcher leave them out, so a write in progress never shows up as a
 * workspace file.
 */
const temporaryWriteName = /^\.halonic-write-[0-9a-f-]+\.tmp$/u;

/** A new name for a temporary file to write and rename over a file in the same folder. */
export function temporaryWriteFileName(): string {
  return `.halonic-write-${randomUUID()}.tmp`;
}

/** Whether the last segment of a name is a temporary write's file. */
export function isTemporaryWrite(name: string): boolean {
  return temporaryWriteName.test(name.slice(name.lastIndexOf("/") + 1));
}
