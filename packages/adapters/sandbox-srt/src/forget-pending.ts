import { closeSync, existsSync, openSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * The mark a removal run with administrator rights leaves in the profile,
 * next to the host lock: the grants srt kept for this user are still to be
 * taken back, by the next host that starts without them (HAL-5404 S2). It
 * is an empty file; nothing ever reads paths or arguments from it.
 */
export function forgetPendingFile(profileFolder: string): string {
  return join(profileFolder, "agent-host", "forget-pending");
}

/**
 * Leaves the mark at `file`. It only ever creates a new empty file, so a
 * process with administrator rights never writes through a file or link
 * that is already there; one that is there counts as the mark. It creates
 * no folder: without the profile's `agent-host` folder no host ran here.
 *
 * @returns whether the mark is there
 */
export function markForgetPending(file: string): boolean {
  try {
    closeSync(openSync(file, "wx"));
    return true;
  } catch (error) {
    return (error as { code?: unknown }).code === "EEXIST";
  }
}

/** Whether the mark is at `file`. */
export function forgetIsPending(file: string): boolean {
  return existsSync(file);
}

/** Takes the mark away, once the grants are taken back. Never throws. */
export function clearForgetPending(file: string): void {
  try {
    rmSync(file, { force: true });
  } catch {
    // The next start forgets again, which changes nothing.
  }
}
