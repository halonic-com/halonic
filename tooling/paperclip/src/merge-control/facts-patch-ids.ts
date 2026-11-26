import { branchPath } from "../pr-tools/pr-status.ts";
import type { GitHubGet } from "../pr-watcher/github.ts";
import { type CompareFile, changeIdOf } from "../pr-watcher/rebase-only.ts";
import type { BoundedCache } from "./facts-cache.ts";
import { type Reviewer, signedApproval } from "./signed.ts";
import type { GatePull } from "./snapshot.ts";

/**
 * The patch-ids the gate's carry-over rule compares (HAL-18460). The plugin
 * has no git, so a head's "patch-id" is the PR watcher's fingerprint of
 * GitHub's compare from the base branch to that head (`changeIdOf`): the
 * same rule the watcher uses to tell its author that only a rebase changed.
 * Only a pull request with a signed approval naming another head needs
 * them; every other head stays null, which never carries. A head's changes
 * from its merge base never change, so each is read once per base.
 */

function differentHead(head: string, sha: string): boolean {
  return !head.startsWith(sha.slice(0, 7));
}

const reviewers: readonly Reviewer[] = ["Liam", "Julian", "Nora"];

/** The heads Liam's, Julian's or Nora's signed approvals by the team account name other than the current one. */
function approvedOtherHeads(pull: GatePull, teamLogin: string): string[] {
  const team = pull.texts.filter((text) => text.by === teamLogin);
  const shas = team.flatMap((text) =>
    reviewers
      .map((reviewer) => signedApproval(text.body, reviewer))
      .flatMap((each) => (each === null ? [] : [each.sha])),
  );
  return [...new Set(shas.filter((sha) => differentHead(pull.head, sha)))];
}

/** What the reader needs. */
export interface PatchIdDeps {
  readonly get: GitHubGet;
  readonly repo: string;
  /** The account whose approval lines count; nobody else's make the reader compare. */
  readonly teamLogin: string;
  /** Change ids by `<base>...<sha>`; a failed read is kept as null too, so it isn't retried every pass. */
  readonly cache: BoundedCache<string | null>;
  readonly log: (line: string) => void;
}

/**
 * One head's change id, or null when GitHub can't compare it (too many
 * files, a binary file, a head GitHub no longer has). A failed compare is
 * logged once and kept as null, so its approval doesn't carry and the
 * reader doesn't ask again until the cache forgets it.
 */
async function changeIdOfHead(deps: PatchIdDeps, base: string, sha: string) {
  const key = `${base}...${sha}`;
  if (deps.cache.has(key)) {
    return deps.cache.get(key) ?? null;
  }
  try {
    const compare = (await deps.get(`/repos/${deps.repo}/compare/${key}`)) as {
      files?: CompareFile[];
    };
    const id = changeIdOf(compare?.files ?? []);
    deps.cache.set(key, id);
    return id;
  } catch (error) {
    deps.log(`patch-id of ${sha.slice(0, 9)} unknown, no carry-over: ${String(error)}`);
    deps.cache.set(key, null);
    return null;
  }
}

/**
 * Patch-ids by sha, as the gate looks them up: the current head by its full
 * sha, an approved head by the sha its approval line names.
 */
export async function readPatchIds(
  deps: PatchIdDeps,
  pulls: readonly GatePull[],
): Promise<Record<string, string | null>> {
  const ids: Record<string, string | null> = {};
  for (const pull of pulls) {
    ids[pull.head] = null;
    const approved = approvedOtherHeads(pull, deps.teamLogin);
    if (approved.length === 0) {
      continue;
    }
    const base = branchPath(pull.base);
    ids[pull.head] = await changeIdOfHead(deps, base, pull.head);
    for (const sha of approved) {
      ids[sha] = await changeIdOfHead(deps, base, sha);
    }
  }
  return ids;
}
