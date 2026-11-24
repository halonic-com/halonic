import type { PluginLogger } from "@paperclipai/plugin-sdk";
import type { CheckState } from "../pr-watcher/decide.ts";
import type { FoundPulls } from "../pr-watcher/discover.ts";
import { pullKey } from "../pr-watcher/facts.ts";
import { ciOk, everyPage, type GitHubGet } from "../pr-watcher/github.ts";
import type { Snapshot, SnapshotPull } from "../snapshot/shape.ts";
import type { StateApi } from "../snapshot/store.ts";
import {
  earlierCommits,
  type OutcomeResult,
  type ReworkReason,
  reworkReasons,
  type TimelineItem,
  taskOutcome,
} from "../thin-spec/outcome.ts";
import { type MetricsApi, writeMetrics } from "./metrics.ts";
import { type CheckRecord, dayLogKey } from "./thin-spec-check.ts";

/**
 * Logs what became of each task the thin-spec check scored (HAL-17355),
 * inside the PR watcher's pass and from its snapshot: once all of a task's
 * pull requests have closed, whether it merged on the first try or after
 * rework. Kept by the day the task was checked, next to that day's log, so
 * a week of scores and outcomes reads side by side (HAL-17077). Like the
 * check, it names task identifiers and pull request numbers, never text.
 */

/** The part of the plugin context the pass uses, so tests can fake it. */
export interface OutcomeApi extends MetricsApi, StateApi {
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

/** What the pass logs about one checked task, once its pull requests closed. */
export interface OutcomeRecord {
  readonly taskId: string;
  readonly identifier: string;
  readonly decidedAt: string;
  readonly outcome: OutcomeResult;
  /** Every reason found across its pull requests; empty for `first_try`. */
  readonly reasons: readonly ReworkReason[];
  /** Its pull requests, as `owner/name#123`. */
  readonly pulls: readonly string[];
}

/** How many days of checks still wait for an outcome. A task without a closed PR by then is left out. */
export const outcomeDays = 14;

/** One outcome list per company and UTC day of the check, beside `log-<day>`. */
export function outcomeLogKey(companyId: string, day: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "thin-spec",
    stateKey: `outcome-${day}`,
  } as const;
}

/** The days to look at, newest first, as `YYYY-MM-DD` in UTC. */
function recentDays(now: Date): string[] {
  const dayMs = 24 * 60 * 60 * 1000;
  return Array.from({ length: outcomeDays }, (_, index) =>
    new Date(now.getTime() - index * dayMs).toISOString().slice(0, 10),
  );
}

/** Why one closed pull request needed rework: its timeline, and `ci-ok` on each earlier commit. */
async function pullReasons(get: GitHubGet, repo: string, pull: SnapshotPull) {
  const path = `/repos/${repo}/issues/${pull.number}/timeline`;
  const timeline = (await everyPage(get, path)) as TimelineItem[];
  const earlierCiOk: CheckState[] = [];
  for (const sha of earlierCommits(timeline, pull.head)) {
    earlierCiOk.push(await ciOk(get, repo, sha));
  }
  return reworkReasons(timeline, earlierCiOk);
}

/** The task's outcome, or undefined while it has no pull request or one is still open. */
async function outcomeOf(
  get: GitHubGet,
  pulls: readonly { readonly repo: string; readonly pull: SnapshotPull }[],
  record: CheckRecord,
  now: Date,
): Promise<OutcomeRecord | undefined> {
  if (pulls.length === 0 || pulls.some(({ pull }) => pull.state === "open")) {
    return undefined;
  }
  const reasons = new Set<ReworkReason>();
  for (const { repo, pull } of pulls) {
    for (const reason of await pullReasons(get, repo, pull)) {
      reasons.add(reason);
    }
  }
  const merged = pulls.some(({ pull }) => pull.state === "merged");
  return {
    taskId: record.taskId,
    identifier: record.identifier,
    decidedAt: now.toISOString(),
    outcome: taskOutcome(merged, [...reasons]),
    reasons: [...reasons].sort(),
    pulls: pulls.map(({ repo, pull }) => pullKey({ repo, number: pull.number })),
  };
}

/** The pull requests the snapshot holds for each task, by `pullKey`. */
function snapshotPulls(snapshot: Snapshot): ReadonlyMap<string, SnapshotPull> {
  return new Map(
    snapshot.repos.flatMap(({ repo, pulls }) =>
      pulls.map((pull) => [pullKey({ repo, number: pull.number }), pull] as const),
    ),
  );
}

/** Adds the outcomes decided today to one day's list. Returns how many it added. */
async function recordDay(
  ctx: OutcomeApi,
  input: ThinSpecOutcomeInput,
  pulls: ReadonlyMap<string, SnapshotPull>,
  day: string,
): Promise<number> {
  const checked =
    ((await ctx.state.get(dayLogKey(input.companyId, day))) as CheckRecord[] | null) ?? [];
  if (checked.length === 0) {
    return 0;
  }
  const key = outcomeLogKey(input.companyId, day);
  const known = ((await ctx.state.get(key)) as OutcomeRecord[] | null) ?? [];
  const decided = new Set(known.map((outcome) => outcome.taskId));
  const added: OutcomeRecord[] = [];
  for (const record of checked.filter((check) => !decided.has(check.taskId))) {
    const refs = input.found.get(record.identifier) ?? [];
    const found = refs.flatMap((ref) => {
      const pull = pulls.get(pullKey(ref));
      return pull === undefined ? [] : [{ repo: ref.repo, pull }];
    });
    const outcome = await outcomeOf(input.get, found, record, input.now);
    if (outcome !== undefined) {
      added.push(outcome);
      decided.add(outcome.taskId);
    }
  }
  if (added.length > 0) {
    await ctx.state.set(key, [...known, ...added]);
  }
  for (const outcome of added) {
    const why = outcome.reasons.length > 0 ? ` (${outcome.reasons.join(", ")})` : "";
    ctx.logger.info(`Thin-spec outcome: ${outcome.identifier} ${outcome.outcome}${why}.`, {
      companyId: input.companyId,
    });
    await writeMetrics(
      ctx,
      { "thin_spec.outcome": 1 },
      { companyId: input.companyId, result: outcome.outcome },
    );
  }
  return added.length;
}

/** What the PR watcher's pass hands the outcome pass. */
export interface ThinSpecOutcomeInput {
  readonly companyId: string;
  readonly snapshot: Snapshot;
  /** The pass's pull requests by task identifier (`discoverPulls`). */
  readonly found: FoundPulls;
  readonly get: GitHubGet;
  readonly now: Date;
}

/**
 * Decides the outcome of every checked task of the last `outcomeDays` days
 * whose pull requests have all closed. Each task is decided once; a task
 * whose PR closed outside the snapshot's window is never decided.
 */
export async function recordThinSpecOutcomes(
  ctx: OutcomeApi,
  input: ThinSpecOutcomeInput,
): Promise<number> {
  const pulls = snapshotPulls(input.snapshot);
  let added = 0;
  for (const day of recentDays(input.now)) {
    added += await recordDay(ctx, input, pulls, day);
  }
  return added;
}
