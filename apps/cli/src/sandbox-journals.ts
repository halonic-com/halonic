// Where the sandbox keeps its crash journals, and the undo of what a crashed
// host left behind (HAL-3588, on HAL-3496). The folder is in the profile
// folder, which is one person's own: the sandbox denies it to the sandboxed
// program, and the journal code refuses a folder that other users can write.

import { recoverGitFolders } from "@halonicjs/adapter-sandbox-srt";
import { type ProfileFolder, sandboxJournalFolder } from "@halonicjs/profile";

/**
 * The journal folder the sandbox should use, or `null` on Windows: there the
 * journal code's owner check always passes, so the folder would need its own
 * restricted ACL first. Until Windows has a sandbox mode (the srt sandbox
 * refuses plain Windows), no journal is kept there.
 */
export function privateJournalFolder(
  profile: ProfileFolder,
  platform: NodeJS.Platform = process.platform,
): string | null {
  return platform === "win32" ? null : sandboxJournalFolder(profile);
}

/**
 * Undoes the `commondir` changes of sessions whose host crashed. Run it once
 * when the host starts, before any session opens. A failure is not the
 * person's problem: an undo that fails is retried at the next start.
 *
 * @returns the files it could not undo
 */
export async function recoverSandboxSessions(
  profile: () => ProfileFolder,
  recover: typeof recoverGitFolders = recoverGitFolders,
  platform: NodeJS.Platform = process.platform,
): Promise<string[]> {
  try {
    // Resolved in here: a profile folder that can't be resolved (a relative
    // HALONIC_HOME) must not stop the program, `--version` included.
    const folder = privateJournalFolder(profile(), platform);
    if (folder === null) return [];
    return (await recover(folder)).failed;
  } catch {
    return [];
  }
}
