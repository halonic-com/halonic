import { isPrivateWorkspacePath, type VcsDivergence } from "@halonicjs/ports";
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

async function currentBranch(repository: Repository, doing = "Can't push"): Promise<string> {
  const head = await repository.run({ args: ["symbolic-ref", "--quiet", "--short", "HEAD"] });
  if (head.code !== 0) throw new Error(`${doing}: no branch is checked out.`);
  const branch = head.stdout.toString("utf8").trim();
  const commit = await repository.run({ args: ["rev-parse", "--verify", "--quiet", "HEAD"] });
  if (commit.code !== 0) throw new Error(`${doing}: ${branch} has no commits yet.`);
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

/**
 * Fetches the upstream's remote, then says where the branch and its upstream
 * parted and which files both changed since; `null` unless both have commits
 * the other lacks. The remote comes from the repository's own config, and
 * `--upload-pack` beats `remote.<name>.uploadpack`.
 *
 * @throws Error when there is no upstream, the fetch fails or the two share no commit
 */
export async function divergenceFromUpstream(
  repository: Repository,
): Promise<VcsDivergence | null> {
  const branch = await currentBranch(repository, "Can't compare");
  const upstream = await upstreamOf(repository, branch);
  if (upstream === null) throw new Error(`Can't compare: ${branch} has no upstream.`);
  const fetch = ["fetch", "--quiet", "--no-tags", "--no-recurse-submodules"];
  await repository.output({
    args: [...fetch, "--upload-pack=git-upload-pack", "--", upstream.remote],
    network: true,
  });
  const found = await repository.run({
    args: ["rev-parse", "--verify", "--quiet", `${branch}@{upstream}^{commit}`],
  });
  if (found.code !== 0) throw new Error(`Can't compare: the remote has no ${upstream.ref}.`);
  const theirs = found.stdout.toString("utf8").trim();
  const ours = (await repository.output({ args: ["rev-parse", "HEAD"] })).toString("utf8").trim();
  if (
    (await isAncestor(repository, theirs, ours)) ||
    (await isAncestor(repository, ours, theirs))
  ) {
    return null;
  }
  const based = await repository.run({ args: ["merge-base", ours, theirs] });
  if (based.code !== 0) throw new Error("Can't compare: the two copies share no version.");
  const base = based.stdout.toString("utf8").trim();
  const [mine, theirsChanged] = [
    await changedSince(repository, base, ours),
    await changedSince(repository, base, theirs),
  ];
  const items = [...mine]
    .filter(([path, id]) => theirsChanged.has(path) && theirsChanged.get(path) !== id)
    .map(([path]) => path)
    .filter((path) => !isPrivateWorkspacePath(path))
    .sort();
  return { ours, theirs, base, items };
}

async function isAncestor(repository: Repository, ancestor: string, of: string): Promise<boolean> {
  const result = await repository.run({ args: ["merge-base", "--is-ancestor", ancestor, of] });
  return result.code === 0;
}

/** Each path that differs between `base` and `commit`, to its object id at `commit` (all zeros once deleted). */
async function changedSince(
  repository: Repository,
  base: string,
  commit: string,
): Promise<Map<string, string>> {
  const args = ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", base, commit];
  const parts = (await repository.output({ args })).toString("utf8").split("\0");
  const changed = new Map<string, string>();
  // `:<old mode> <new mode> <old id> <new id> <status>`, then the path.
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const fields = (parts[i] ?? "").split(" ");
    const id = fields[3];
    const path = parts[i + 1];
    if (id !== undefined && path !== undefined) changed.set(path, id);
  }
  return changed;
}
