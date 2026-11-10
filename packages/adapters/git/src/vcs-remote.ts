import { outputLines } from "./git-output.ts";
import type { Repository } from "./repository.ts";

/**
 * Brings in the upstream's commits, fast-forward only. The remote and the
 * branch come from the repository's own config, never from a caller.
 * `--upload-pack` beats `remote.<name>.uploadpack`.
 *
 * @throws Error when there is no upstream, the branch and its upstream have both moved on, or the pull would overwrite a change
 */
export async function pullFastForward(repository: Repository): Promise<void> {
  const args = [
    "pull",
    "--quiet",
    "--ff-only",
    "--no-rebase",
    "--no-autostash",
    "--no-recurse-submodules",
    "--upload-pack=git-upload-pack",
  ];
  await repository.output({ args, network: true });
}

/**
 * Sends the current branch to its upstream, or, without one, to the first
 * remote under the same name, which becomes its upstream. Never forced.
 * `--receive-pack` beats `remote.<name>.receivepack`, and `--` keeps a
 * remote name from the repository's config from being read as an option.
 *
 * @throws Error when the branch has no commits, there is no remote, or the remote has commits the branch doesn't
 */
export async function pushToUpstream(repository: Repository): Promise<void> {
  const branch = await currentBranch(repository);
  const target = (await upstreamOf(repository, branch)) ?? (await firstRemote(repository, branch));
  const refspec = `refs/heads/${branch}:${target.ref}`;
  const args = [
    "push",
    "--quiet",
    "--no-recurse-submodules",
    "--receive-pack=git-receive-pack",
    ...(target.setUpstream ? ["--set-upstream"] : []),
    "--",
    target.remote,
    refspec,
  ];
  await repository.output({ args, network: true });
}

interface PushTarget {
  remote: string;
  /** The full ref on the remote, such as `refs/heads/main`. */
  ref: string;
  setUpstream: boolean;
}

async function currentBranch(repository: Repository): Promise<string> {
  const head = await repository.run({ args: ["symbolic-ref", "--quiet", "--short", "HEAD"] });
  if (head.code !== 0) throw new Error("Can't push: no branch is checked out.");
  const branch = head.stdout.toString("utf8").trim();
  const commit = await repository.run({ args: ["rev-parse", "--verify", "--quiet", "HEAD"] });
  if (commit.code !== 0) throw new Error(`Can't push: ${branch} has no commits yet.`);
  return branch;
}

async function upstreamOf(repository: Repository, branch: string): Promise<PushTarget | null> {
  const remote = await configValue(repository, `branch.${branch}.remote`);
  const ref = await configValue(repository, `branch.${branch}.merge`);
  if (remote === null || ref === null) return null;
  return { remote, ref, setUpstream: false };
}

async function firstRemote(repository: Repository, branch: string): Promise<PushTarget> {
  const [remote] = outputLines(await repository.output({ args: ["remote"] }));
  if (remote === undefined) throw new Error("Can't push: the repository has no remote.");
  return { remote, ref: `refs/heads/${branch}`, setUpstream: true };
}

async function configValue(repository: Repository, key: string): Promise<string | null> {
  const result = await repository.run({ args: ["config", "--get", "--", key] });
  if (result.code !== 0) return null;
  return result.stdout.toString("utf8").trim();
}
