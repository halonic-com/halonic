import type { KeptGrants } from "./kept-grants.ts";
import type { Machine } from "./machine.ts";
import type { SandboxRemoval } from "./srt-sandbox.ts";

const grantsKeptElevated =
  "Removed the Windows sandbox, but skipped forgetting its kept access grants: this removal ran with administrator rights. Remove it again without them to forget the grants.";
const grantsKeptOrphaned =
  "Removed the Windows sandbox, but skipped forgetting its kept access grants: this removal ran with administrator rights. Halonic takes them back the next time it starts as this user without them, or run `srt-win acl forget --all`.";
const takenBack =
  "Took back the access the Windows sandbox kept on your folders, which a removal with administrator rights had left.";
const takeBackFailed =
  "Couldn't take back the access the Windows sandbox kept on your folders after a removal with administrator rights; trying again at the next start";
const takeBackElevated =
  "Didn't take back the access the Windows sandbox kept on your folders after a removal with administrator rights: this process runs with administrator rights too.";

/**
 * What a removal that skipped the user's kept grants for its administrator
 * rights gives (HAL-7585), from what srt keeps after it
 * ({@link KeptGrants.keptState}): `keptAccess: "until_next_start"` when the
 * next start takes them back, as srt lists kept grants while its sandbox
 * account is gone (HAL-15004); `keptAccess: "manual"` when they may stay
 * until the sandbox is removed again without administrator rights
 * (HAL-15836); and no `keptAccess` when srt keeps none. So Settings, the CLI
 * and the uninstaller can say so. It logs the first two. Never rejects.
 */
export async function removedGrantsKept(
  grants: Pick<KeptGrants, "keptState">,
  warn: (message: string) => void,
): Promise<SandboxRemoval> {
  const state = await grants.keptState();
  if (state === "none") return { ok: true };
  if (state === "kept") {
    warn(grantsKeptElevated);
    return { ok: true, keptAccess: "manual" };
  }
  warn(grantsKeptOrphaned);
  return { ok: true, keptAccess: "until_next_start" };
}

/**
 * What {@link takeBackOrphaned} did: `taken_back`, `none` when srt keeps
 * nothing it should take back (or this isn't Windows), `elevated` when it
 * skipped them for this process's administrator rights, `failed` when srt
 * couldn't forget them.
 */
export type TakeBack = "taken_back" | "none" | "elevated" | "failed";

/**
 * On Windows, takes back every grant srt kept for this user when srt lists
 * kept grants while its sandbox account is gone: what a removal run with
 * administrator rights leaves (HAL-5404 S2). It writes nothing of its own
 * and reads only srt's status. Only a process without administrator rights
 * does it (HAL-7544); one that can't tell counts as having them. A failure
 * is logged; the grants stay listed, so the next start tries again. Never
 * rejects.
 *
 * @param machine - its `elevated()` says whether this process runs with administrator rights; a machine without it counts as elevated
 * @returns what it did, for the installer's `--sandbox-take-back` (HAL-16084)
 */
export async function takeBackOrphaned(
  machine: Pick<Machine, "platform" | "elevated">,
  grants: Pick<KeptGrants, "orphaned" | "forgetAll">,
  warn: (message: string) => void,
): Promise<TakeBack> {
  if (machine.platform !== "win32") return "none";
  try {
    if (!(await grants.orphaned())) return "none";
    if ((await machine.elevated?.()) ?? true) {
      warn(takeBackElevated);
      return "elevated";
    }
    const failed = await grants.forgetAll();
    if (failed.length > 0) {
      warn(`${takeBackFailed} (${failed.join("; ")})`);
      return "failed";
    }
    warn(takenBack);
    return "taken_back";
  } catch (error) {
    warn(`${takeBackFailed} (${error instanceof Error ? error.message : String(error)})`);
    return "failed";
  }
}
