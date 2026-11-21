import type { DeployPlan, DeployReach, DeployResource } from "@halonicjs/ports";

/**
 * What a deploy would change that the user hasn't said yes to, measured
 * against what's live on the host, not against `deployments.yaml` (deploy
 * flow choice C4).
 */
export interface DeployNews {
  /** Nothing is live yet. */
  readonly first: boolean;
  readonly creates: readonly DeployResource[];
  /** A database change deletes data. */
  readonly deletesData: boolean;
  /** Addresses the live version doesn't reach, or reaches with another secret. */
  readonly reaches: readonly DeployReach[];
}

/**
 * Compares a plan with what the workspace now reaches. A new commit alone is
 * no news: only something to create, a change that deletes data, a new
 * address or a secret sent to another address is.
 *
 * @example
 * const news = deployNews(plan, request.reaches);
 * if (hasNews(news)) await questions.confirm(plan, news);
 */
export function deployNews(plan: DeployPlan, reaches: readonly DeployReach[]): DeployNews {
  const live = plan.liveReaches ?? [];
  const isLive = (reach: DeployReach) =>
    live.some((old) => old.address === reach.address && old.secret === reach.secret);
  return {
    first: plan.live === undefined,
    creates: plan.creates,
    deletesData: plan.deletesData,
    reaches: plan.live === undefined ? [] : reaches.filter((reach) => !isLive(reach)),
  };
}

/** Whether the deploy has to ask `Deploy? [y/N]` (or be given `--yes`). */
export function hasNews(news: DeployNews): boolean {
  return news.first || news.creates.length > 0 || news.deletesData || news.reaches.length > 0;
}
