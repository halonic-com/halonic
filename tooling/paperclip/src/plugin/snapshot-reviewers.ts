import type { PluginLogger } from "@paperclipai/plugin-sdk";
import type { GitHubGet } from "../pr-watcher/github.ts";
import { reviewerAnswer } from "../pr-watcher/route.ts";
import { emptyReviewerCache, type ReviewerCache, withReviewers } from "../snapshot/reviewers.ts";
import type { Snapshot } from "../snapshot/shape.ts";
import type { StateApi } from "../snapshot/store.ts";

/**
 * The pass's step that names each open pull request's reviewer in the
 * snapshot (`snapshot/reviewers.ts`, HAL-19653), with the per-head cache
 * kept in plugin state between passes.
 */

function cacheKey(companyId: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "github",
    stateKey: "snapshot-reviewers",
  } as const;
}

/**
 * The snapshot with each open pull request's reviewer, read from GitHub only
 * for heads the cache doesn't know. A cache that can't be saved is logged;
 * the next pass reads those heads again.
 */
export async function addReviewers(
  ctx: StateApi & { readonly logger: Pick<PluginLogger, "info" | "error"> },
  companyId: string,
  snapshot: Snapshot,
  options: { readonly repo: string; readonly get: GitHubGet },
): Promise<Snapshot> {
  const stored = (await ctx.state.get(cacheKey(companyId))) as ReviewerCache | null;
  const result = await withReviewers(snapshot, {
    repo: options.repo,
    before: stored?.version === 1 ? stored : emptyReviewerCache,
    read: async (repo, number) => {
      const answer = await reviewerAnswer(options.get, repo, number);
      return { head: answer.head, reviewer: answer.reviewer };
    },
    log: (line) => ctx.logger.error(`PR watcher: ${line}`, { companyId }),
  });
  await ctx.state.set(cacheKey(companyId), result.cache).catch((error: unknown) => {
    ctx.logger.error(
      `PR watcher: couldn't save the reviewers' cache: ${(error as Error).message}`,
      { companyId },
    );
  });
  return result.snapshot;
}
