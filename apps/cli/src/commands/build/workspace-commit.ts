// The commit a plugin is built from, as git sees the workspace: its current
// commit, and the files the build read that the commit doesn't hold as they
// are (`workspace.yaml` or a tool file with changes, or a tool file git
// doesn't have, untracked or ignored). The build service decides what to
// refuse; this file only asks git.

import type { GitRunnerOptions } from "@halonicjs/adapter-git";
import type { WorkspaceCommit } from "@halonicjs/app";
import { settingsPath } from "@halonicjs/workspace";
import { openGitHistory } from "../../run-workspace.ts";

/** Where the tool files sit, from the workspace's root. */
const toolsFolder = "library/tools";

/**
 * The workspace's current commit and what it doesn't hold.
 *
 * @param root - the workspace folder, which must be a repository's root
 * @param toolFiles - the tool files the build read, as workspace paths
 * @param git - which git; the one on the `PATH` by default
 */
export async function workspaceCommit(
  root: string,
  toolFiles: readonly string[],
  git: GitRunnerOptions = {},
): Promise<WorkspaceCommit> {
  const history = await openGitHistory(root, git);
  if (history === null) return { kind: "no-repository" };
  try {
    const [head] = await history.vcs.log(1);
    if (head === undefined) return { kind: "no-commit" };
    const committed = new Set((await history.vcs.listAt(head.hash, toolsFolder)) ?? []);
    const changed = (await history.vcs.status()).changes
      .map((change) => change.path)
      .filter((path) => path === settingsPath || path.startsWith(`${toolsFolder}/`));
    const uncommitted = new Set([...changed, ...toolFiles.filter((path) => !committed.has(path))]);
    return { kind: "commit", id: head.hash, uncommitted: [...uncommitted].sort() };
  } finally {
    await history.close();
  }
}
