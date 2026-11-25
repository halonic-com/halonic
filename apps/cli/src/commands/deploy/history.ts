// The history a deploy takes its files from (HAL-18200): a workspace is
// usually a git repository, but it may be a folder in one, such as `studio/`
// in an app's repository. The deploy then reads that folder in the
// repository's last commit, as git would from inside the folder.

import { access, realpath } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { GitRunner, type GitRunnerOptions, GitVcs } from "@halonicjs/adapter-git";
import { isPrivateWorkspacePath, type VcsChange, type VcsStatus } from "@halonicjs/ports";
import { type OpenedHistory, openGitHistory, type WorkspaceHistory } from "../../run-workspace.ts";

/**
 * The history of the repository `root` is in, as seen from `root`: its own
 * when it is the repository's root, or, when it is a folder further down,
 * the nearest repository above it, with paths relative to `root` and only
 * the changes in it. `null` when no folder from `root` up is a repository.
 *
 * @throws Error when the repository is found but git isn't, or drops the hardening
 */
export async function openDeployHistory(
  root: string,
  options: GitRunnerOptions = {},
): Promise<OpenedHistory | null> {
  const folder = await realpath(root);
  const top = await repositoryAbove(folder);
  if (top === null) return null;
  if (top === folder) return await openGitHistory(folder, options);
  const runner = await GitRunner.create(options);
  // A deploy only reads the history, so it never commits as this author.
  const vcs = new GitVcs(top, { runner, author: { name: "Halonic", email: "halonic@localhost" } });
  return {
    vcs: inFolder(vcs, relative(top, folder).split(sep).join("/")),
    close: () => runner.close(),
  };
}

/** The nearest folder from `folder` up with a `.git` in it, as git finds it; `null` when none has one. */
async function repositoryAbove(folder: string): Promise<string | null> {
  for (let at = folder; ; at = dirname(at)) {
    if (await exists(join(at, ".git"))) return at;
    if (dirname(at) === at) return null;
  }
}

/** `history` seen from `prefix`, a folder in it: paths relative to that folder, and only what is in it. */
function inFolder(history: WorkspaceHistory, prefix: string): WorkspaceHistory {
  const inside = (path: string | undefined): path is string =>
    path?.startsWith(`${prefix}/`) === true;
  const own = (path: string) => path.slice(prefix.length + 1);
  const ownChange = ({ path, from, ...change }: VcsChange): VcsChange[] => {
    if (!inside(path) && !inside(from)) return [];
    // A move into or out of the folder is a change in it, by the path it has here.
    if (!inside(path)) return [{ ...change, path: own(from as string) }];
    return [{ ...change, path: own(path), ...(inside(from) ? { from: own(from) } : {}) }];
  };
  return {
    log: (limit) => history.log(limit),
    status: async (): Promise<VcsStatus> => {
      const status = await history.status();
      return { ...status, changes: status.changes.flatMap(ownChange) };
    },
    readAt: (version, path) => history.readAt(version, `${prefix}/${path}`),
    listAt: async (version, dir) => {
      const listed = await history.listAt(version, dir === undefined ? prefix : `${prefix}/${dir}`);
      return (
        listed
          ?.filter(inside)
          .map(own)
          .filter((path) => !isPrivateWorkspacePath(path)) ?? null
      );
    },
  };
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}
