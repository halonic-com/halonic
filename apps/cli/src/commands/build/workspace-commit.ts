// The commit a plugin is built from, as git sees the workspace: its current
// commit, and the files the build read that the commit doesn't hold as they
// are (`workspace.yaml` or a tool or template file with changes, or a tool
// or template file git doesn't have, untracked or ignored). The build service decides what to
// refuse; this file only asks git.

import type { GitRunnerOptions } from "@halonicjs/adapter-git";
import type { WorkspaceCommit } from "@halonicjs/app";
import { settingsPath } from "@halonicjs/workspace";
import { openGitHistory } from "../../run-workspace.ts";

/** Where the tool and template files sit, from the workspace's root. */
const builtFolders = ["library/tools", "library/templates"] as const;

/**
 * The workspace's current commit and what it doesn't hold.
 *
 * @param root - the workspace folder, which must be a repository's root
 * @param builtFiles - the tool and template files the build read, as workspace paths
 * @param git - which git; the one on the `PATH` by default
 */
export async function workspaceCommit(
  root: string,
  builtFiles: readonly string[],
  git: GitRunnerOptions = {},
): Promise<WorkspaceCommit> {
  const history = await openGitHistory(root, git);
  if (history === null) return { kind: "no-repository" };
  try {
    const [head] = await history.vcs.log(1);
    if (head === undefined) return { kind: "no-commit" };
    const committed = new Set<string>();
    for (const folder of builtFolders) {
      for (const path of (await history.vcs.listAt(head.hash, folder)) ?? []) committed.add(path);
    }
    const changed = (await history.vcs.status()).changes
      .map((change) => change.path)
      .filter((path) => path === settingsPath || isInBuiltFolder(path));
    const uncommitted = new Set([...changed, ...builtFiles.filter((path) => !committed.has(path))]);
    return { kind: "commit", id: head.hash, uncommitted: [...uncommitted].sort() };
  } finally {
    await history.close();
  }
}

function isInBuiltFolder(path: string): boolean {
  return builtFolders.some((folder) => path.startsWith(`${folder}/`));
}
