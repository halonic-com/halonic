// Where the sandbox keeps its crash journals, and the undo of what a crashed
// host left behind (HAL-3588, on HAL-3496). The folder is in the profile
// folder, which is one person's own: the sandbox denies it to the sandboxed
// program, and the journal code refuses a folder that other users can write.

import { recoverGitFolders } from "@halonicjs/adapter-sandbox-srt";
import { type ProfileFolder, sandboxJournalFolder } from "@halonicjs/profile";

/**
 * The journal folder the sandbox should use. On Windows the journal code's
 * owner check always passes, so it gives the folder its own access list
 * (this user only, no inheritance) before it keeps anything there (HAL-3896).
 */
export function privateJournalFolder(profile: ProfileFolder): string {
  return sandboxJournalFolder(profile);
}

/**
 * Undoes the `commondir` changes of sessions whose host crashed. Run it once
 * when the host starts, before any session opens. A failure is not the
 * person's problem: an undo that fails is retried at the next start. Each
 * file it couldn't undo, or the error when it couldn't run, goes to `debug`
 * (HAL-5215).
 *
 * @returns the files it could not undo
 */
export async function recoverSandboxSessions(
  profile: () => ProfileFolder,
  recover: typeof recoverGitFolders = recoverGitFolders,
  debug: (line: string) => void = () => {},
): Promise<string[]> {
  let failed: string[];
  try {
    // Resolved in here: a profile folder that can't be resolved (a relative
    // HALONIC_HOME) must not stop the program, `--version` included.
    failed = (await recover(privateJournalFolder(profile()))).failed;
  } catch (error) {
    debug(
      `Couldn't undo what crashed sandbox sessions left, trying again at the next start: ${messageOf(error)}`,
    );
    return [];
  }
  for (const file of failed) {
    debug(
      `Couldn't undo a crashed sandbox session's change to ${file}, trying again at the next start.`,
    );
  }
  return failed;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
