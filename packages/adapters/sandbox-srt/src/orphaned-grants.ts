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
 * rights gives (HAL-7585). It logs that they go at the next start only when
 * that start will see them, as srt then lists kept grants while its sandbox
 * account is gone (see {@link KeptGrants.orphaned}), and only then sets
 * `keptAccess`, so the uninstaller's last page can say so (HAL-15004).
 * Never rejects.
 */
export async function removedGrantsKept(
  grants: Pick<KeptGrants, "orphaned">,
  warn: (message: string) => void,
): Promise<SandboxRemoval> {
  if (!(await grants.orphaned())) {
    warn(grantsKeptElevated);
    return { ok: true };
  }
  warn(grantsKeptOrphaned);
  return { ok: true, keptAccess: "until_next_start" };
}

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
 */
export async function takeBackOrphaned(
  machine: Pick<Machine, "platform" | "elevated">,
  grants: Pick<KeptGrants, "orphaned" | "forgetAll">,
  warn: (message: string) => void,
): Promise<void> {
  if (machine.platform !== "win32") return;
  try {
    if (!(await grants.orphaned())) return;
    if ((await machine.elevated?.()) ?? true) {
      warn(takeBackElevated);
      return;
    }
    const failed = await grants.forgetAll();
    if (failed.length > 0) {
      warn(`${takeBackFailed} (${failed.join("; ")})`);
      return;
    }
    warn(takenBack);
  } catch (error) {
    warn(`${takeBackFailed} (${error instanceof Error ? error.message : String(error)})`);
  }
}
