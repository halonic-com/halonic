// The commit a plugin is built from, as git sees the workspace: its current
// commit, and the files the build read that the commit doesn't hold as they
// are (`workspace.yaml`, `routing.yaml` or a tool, template or signal file
// with changes, or a file the build read that git doesn't have, untracked or
// ignored). The build service decides what to refuse; this file only asks git.

import type { GitRunnerOptions } from "@halonicjs/adapter-git";
import type { WorkspaceCommit } from "@halonicjs/app";
import { settingsPath } from "@halonicjs/workspace";
import { openGitHistory } from "../../run-workspace.ts";

/** Where the tool, template and signal files sit, from the workspace's root. */
const builtFolders = ["library/tools", "library/templates", "library/signals"] as const;

/** The files at the workspace's root the build reads. */
const builtRootFiles: readonly string[] = [settingsPath, "routing.yaml"];

/**
 * The workspace's current commit and what it doesn't hold.
 *
 * @param root - the workspace folder, which must be a repository's root
 * @param builtFiles - the tool, template, signal and routing files the build read, as workspace paths
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
    for (const path of builtFiles.filter((file) => builtRootFiles.includes(file))) {
      if ((await history.vcs.readAt(head.hash, path)) !== null) committed.add(path);
    }
    const changed = (await history.vcs.status()).changes
      .map((change) => change.path)
      .filter((path) => builtRootFiles.includes(path) || isInBuiltFolder(path));
    const uncommitted = new Set([...changed, ...builtFiles.filter((path) => !committed.has(path))]);
    return { kind: "commit", id: head.hash, uncommitted: [...uncommitted].sort() };
  } finally {
    await history.close();
  }
}

function isInBuiltFolder(path: string): boolean {
  return builtFolders.some((folder) => path.startsWith(`${folder}/`));
}
