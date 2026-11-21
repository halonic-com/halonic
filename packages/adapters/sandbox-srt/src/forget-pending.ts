import { closeSync, existsSync, openSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { KeptGrants } from "./kept-grants.ts";
import type { Machine } from "./machine.ts";

const grantsKeptElevated =
  "Removed the Windows sandbox, but skipped forgetting its kept access grants: this removal ran with administrator rights. Remove it again without them to forget the grants.";
const grantsKeptMarked =
  "Removed the Windows sandbox, but skipped forgetting its kept access grants: this removal ran with administrator rights. Halonic takes them back the next time it starts as this user, or run `srt-win acl forget --all`.";
const forgetPendingDone =
  "Took back the access the Windows sandbox kept on your folders, which a removal with administrator rights had left.";
const forgetPendingFailed =
  "Couldn't take back the access the Windows sandbox kept on your folders after a removal with administrator rights; trying again at the next start";
const forgetPendingElevated =
  "Didn't take back the access the Windows sandbox kept on your folders after a removal with administrator rights: this host runs with administrator rights too.";

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

/**
 * For a removal that skipped the user's kept grants for its administrator
 * rights: leaves the mark at `file` when there is one, and gives the log
 * line that says when the grants go.
 */
export function markGrantsKept(file: string | undefined): string {
  return file !== undefined && markForgetPending(file) ? grantsKeptMarked : grantsKeptElevated;
}

/**
 * On Windows, takes back every grant srt kept for this user when a removal run with
 * administrator rights skipped them (HAL-5404 S2): when the mark is at
 * `file`, or when srt still lists kept grants while its sandbox account is
 * gone (a removal from another account leaves its mark in that account's
 * profile). Only a process without administrator rights does it (HAL-7544);
 * one that can't tell counts as having them. Only a success takes the mark
 * away; a failure is logged and tried again at the next start. Give it only
 * to the holder of the profile's host lock, before its sweep. Without a
 * `file`, or on other systems, it does nothing. Never rejects.
 *
 * @param machine - its `elevated()` says whether this process runs with administrator rights; a machine without it counts as elevated
 */
export async function takeBackPending(
  machine: Pick<Machine, "platform" | "elevated">,
  file: string | undefined,
  grants: Pick<KeptGrants, "orphaned" | "forgetAll">,
  warn: (message: string) => void,
): Promise<void> {
  if (machine.platform !== "win32" || file === undefined) return;
  try {
    if (!forgetIsPending(file) && !(await grants.orphaned())) return;
    if ((await machine.elevated?.()) ?? true) {
      warn(forgetPendingElevated);
      return;
    }
    const failed = await grants.forgetAll();
    if (failed.length > 0) {
      warn(`${forgetPendingFailed} (${failed.join("; ")})`);
      return;
    }
    clearForgetPending(file);
    warn(forgetPendingDone);
  } catch (error) {
    warn(`${forgetPendingFailed} (${error instanceof Error ? error.message : String(error)})`);
  }
}
