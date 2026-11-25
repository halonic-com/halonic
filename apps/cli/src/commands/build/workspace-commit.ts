// The commit a plugin is built from. The release file names it, so it must
// really hold the tool files the build read: a tool file or `workspace.yaml`
// with changes that aren't committed, or a tool file git doesn't have (an
// untracked or ignored one), stops the build.

import type { GitRunnerOptions } from "@halonicjs/adapter-git";
import { settingsPath } from "@halonicjs/workspace";
import { DetailedError } from "../../command.ts";
import { buildMessages } from "../../messages/build.ts";
import { openGitHistory } from "../../run-workspace.ts";

/** Where the tool files sit, from the workspace's root. */
const toolsFolder = "library/tools";

/**
 * The workspace's current commit, once it holds every file the build reads.
 *
 * @param root - the workspace folder, which must be a repository's root
 * @param toolFiles - the tool files the build read, as workspace paths
 * @param git - which git; the one on the `PATH` by default
 * @throws DetailedError `conflict` when the folder isn't a repository, has no
 *   commit, or a file the build read isn't committed as it is
 */
export async function workspaceCommit(
  root: string,
  toolFiles: readonly string[],
  git: GitRunnerOptions = {},
): Promise<string> {
  const history = await openGitHistory(root, git);
  if (history === null) {
    throw new DetailedError("conflict", buildMessages.notInGit(), buildMessages.commitFix());
  }
  try {
    const [head] = await history.vcs.log(1);
    if (head === undefined) {
      throw new DetailedError("conflict", buildMessages.noCommit(), buildMessages.commitFix());
    }
    const committed = new Set((await history.vcs.listAt(head.hash, toolsFolder)) ?? []);
    const changed = (await history.vcs.status()).changes
      .map((change) => change.path)
      .filter((path) => path === settingsPath || path.startsWith(`${toolsFolder}/`));
    const notCommitted = [
      ...new Set([...changed, ...toolFiles.filter((path) => !committed.has(path))]),
    ].sort();
    if (notCommitted.length > 0) {
      throw new DetailedError(
        "conflict",
        buildMessages.uncommitted(notCommitted),
        buildMessages.commitFix(),
        { files: notCommitted },
      );
    }
    return head.hash;
  } finally {
    await history.close();
  }
}
