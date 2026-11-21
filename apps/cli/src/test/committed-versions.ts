import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { WatchedVersions } from "../commands/routines/watch-versions.ts";
import { openGitHistory } from "../run-workspace.ts";
import { type OpenWorkspaceDir, openWorkspaceDir } from "../workspace-dir.ts";

/** A workspace folder under git, with its files committed, watched as `halonic serve` watches it. */
export interface CommittedVersions {
  /** The workspace folder as the CLI opens it. */
  readonly dir: OpenWorkspaceDir;
  /** The versions `serve` reads: close them at the end of the test. */
  readonly versions: WatchedVersions;
  /** Stages and commits every file saved in the folder now. */
  commitAll(): Promise<void>;
}

/**
 * Starts a git repository in `root`, commits the files already there and
 * opens the workspace's versions over it. A test that a served reader follows
 * a new commit before any run starts from it commits again with `commitAll`.
 * Starting git and committing can take longer than 5 s on a busy runner, so
 * such a test gets a longer timeout.
 */
export async function committedVersions(root: string): Promise<CommittedVersions> {
  const git = await testGit();
  const vcs = new GitVcs(root, {
    runner: await GitRunner.create({ git }),
    author: { name: "Test", email: "test@example.com" },
  });
  await vcs.init();
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: root });
  const commitAll = async () => {
    await vcs.stage(await dir.store.list());
    await vcs.commit("A version");
  };
  await commitAll();
  const versions = await WatchedVersions.open(dir, (folder) => openGitHistory(folder, { git }));
  return { dir, versions, commitAll };
}
