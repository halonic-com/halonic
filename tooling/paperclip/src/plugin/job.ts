import {
  PLUGIN_RPC_ERROR_CODES,
  type PluginCompaniesClient,
  type PluginConfigClient,
  type PluginHttpClient,
  type PluginLogger,
  type PluginSecretsClient,
} from "@paperclipai/plugin-sdk";
import { fastTrackPass, loadFastTrack, saveFastTrack } from "../fast-track/pass.ts";
import { sharedLabelAdder } from "../fast-track/rules.ts";
import {
  readSharedLabelList,
  type SharedLabelList,
  sharedLabelScope,
} from "../fast-track/scope.ts";
import { gitHubConflictFiles } from "../pr-watcher/conflict-files.ts";
import { discoverPulls } from "../pr-watcher/discover.ts";
import { baseGreenSince, snapshotFacts } from "../pr-watcher/facts.ts";
import { ciOk, gitHubReader } from "../pr-watcher/github.ts";
import { type HeldHead, heldHeads } from "../pr-watcher/held.ts";
import { countMonitors, type MonitorCounts } from "../pr-watcher/monitors.ts";
import type { TaskRow } from "../pr-watcher/paperclip.ts";
import { gitHubRebaseOnly } from "../pr-watcher/rebase-only.ts";
import { longestWaitingLine } from "../pr-watcher/review-wait.ts";
import { gitHubRoute } from "../pr-watcher/route.ts";
import { unblockPass } from "../pr-watcher/unblock.ts";
import { snapshotCopies, snapshotSummary } from "../pr-watcher/wake-status.ts";
import { type TickSummary, tick } from "../pr-watcher/watch.ts";
import { gitHubQueryReader } from "../snapshot/graphql.ts";
import { takeSnapshot } from "../snapshot/read.ts";
import type { GitHubTokenKind, Snapshot } from "../snapshot/shape.ts";
import { type StateApi, saveSnapshot } from "../snapshot/store.ts";
import { paperclipCopies } from "../verdicts/approval-copies.ts";
import { readWatchersSettings, runMergeWatchers, type WatchersSettings } from "../watchers/run.ts";
import { chiefLinePrPass } from "./chief-line-prs.ts";
import { readChiefLineSettings } from "./chief-line-settings.ts";
import { type CompanySource, listedCompanies } from "./companies.ts";
import type { LifecycleRunner } from "./fast-track-lifecycle-job.ts";
import { type HostApi, paperclipHost, unblockHost } from "./host.ts";
import { passStateKey } from "./merge-control-lock.ts";
import { countingFetch, type MetricsApi, writeMetrics } from "./metrics.ts";
import { type RunsFetch, reviewerLimitsOf } from "./reviewer-runs.ts";
import { prWatcherSignalPass, watcherRecorder } from "./signal-pass-job.ts";
import { addReviewers } from "./snapshot-reviewers.ts";
import {
  readStackRebaseSettings,
  type StackRebaseSettings,
  stackRebaseOf,
} from "./stack-rebase-job.ts";
import { recordThinSpecOutcomes } from "./thin-spec-outcome.ts";

/** The part of the plugin context the job uses, so tests can fake it. */
export interface JobApi extends HostApi, MetricsApi, StateApi {
  readonly companies: Pick<PluginCompaniesClient, "list">;
  readonly config: PluginConfigClient;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly http: PluginHttpClient;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

/** A company's settings for the watcher, as the board sets them. */
export interface WatcherSettings {
  /** The secret that holds the read-only GitHub token, or undefined when none is set. */
  readonly token: { readonly type: "secret_ref"; readonly secretId: string } | undefined;
  readonly repos: readonly string[];
  /** Only log what it would do. On unless the board turns it off. */
  readonly dryRun: boolean;
  /** Fast-track pull requests the board or Chief said unblock the queue or CI for everyone (HAL-15971 point 3). */
  readonly fastTrackUnblocks: ReadonlySet<number>;
  /** The board's GitHub login, whose `fast-track` label counts for a jump on any pull request; empty: only `halonic-dev`'s counts, within its scope. */
  readonly fastTrackLabelAdder: string;
  /** The reviewer wake and the 6-hour escalation (HAL-17938). */
  readonly watchers: WatchersSettings;
  /** Where a `fast-track` label added as `halonic-dev` counts (HAL-16003 scope note); unset: the board's list of 24 Nov. */
  readonly fastTrackSharedLabelScope: SharedLabelList;
  /** Rebasing a stacked pull request after its base merged (HAL-18031). */
  readonly stackRebase: StackRebaseSettings;
}

/** `halonic` first: tools without a `repo` argument answer for the first one. */
export const defaultRepos = ["halonic-com/halonic", "halonic-com/cloud"];

/** How long one GitHub request may take. The worker has no resource limits of its own. */
export const requestTimeoutMs = 15_000;

/** `owner/name` only, so a setting can't steer a request to another API path. */
function isRepo(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[\w.-]+\/[\w.-]+$/.test(value) &&
    value.split("/").every((part) => part !== "." && part !== "..")
  );
}

/** Reads a company's settings; a missing or odd value falls back to the safe default. */
export function readSettings(config: Readonly<Record<string, unknown>>): WatcherSettings {
  const token = config["githubToken"] as { type?: unknown; secretId?: unknown } | undefined;
  const repos = Array.isArray(config["repos"]) ? config["repos"].filter(isRepo) : [];
  return {
    token:
      token?.type === "secret_ref" && typeof token.secretId === "string"
        ? { ...(token as object), type: "secret_ref", secretId: token.secretId }
        : undefined,
    repos: repos.length > 0 ? repos : defaultRepos,
    dryRun: config["dryRun"] !== false,
    fastTrackUnblocks: new Set(
      (Array.isArray(config["fastTrackUnblocks"]) ? config["fastTrackUnblocks"] : []).filter(
        (value): value is number => Number.isInteger(value) && value > 0,
      ),
    ),
    fastTrackLabelAdder:
      typeof config["fastTrackLabelAdder"] === "string" ? config["fastTrackLabelAdder"].trim() : "",
    watchers: readWatchersSettings(config),
    fastTrackSharedLabelScope: readSharedLabelList(config["fastTrackSharedLabelScope"]),
    stackRebase: readStackRebaseSettings(config),
  };
}

/**
 * Reads a company's saved settings, or undefined when the board saved none for it.
 * A scheduled job runs outside any company, and the host then lets the
 * plugin read only the companies it has saved settings for; any other
 * company is refused with `INVOCATION_SCOPE_DENIED`.
 */
export async function companyConfig(
  config: PluginConfigClient,
  companyId: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    return await config.get(companyId);
  } catch (error) {
    if ((error as { code?: unknown }).code === PLUGIN_RPC_ERROR_CODES.INVOCATION_SCOPE_DENIED) {
      return undefined;
    }
    throw error;
  }
}

async function companySettings(
  ctx: JobApi,
  companyId: string,
): Promise<WatcherSettings | undefined> {
  const config = await companyConfig(ctx.config, companyId);
  return config === undefined ? undefined : readSettings(config);
}

/** The pass's GitHub calls, by the step that made them, and the token they went out on (HAL-17933). */
export interface CallCounts {
  readonly token: GitHubTokenKind;
  readonly snapshot: number;
  /** The watcher's own reads beyond the snapshot: merge commits' checks, base runs, routes, rebases. */
  readonly watcher: number;
  readonly thinSpec: number;
}

/** What one pass for one company counted. */
interface PassCounts {
  readonly summary: TickSummary;
  readonly monitors: MonitorCounts;
  readonly calls: CallCounts;
  readonly durationMs: number;
}

/** `42 GitHub calls on the shared token (snapshot 20, watcher 21, thin-spec 1)`. */
export function callsText(calls: CallCounts): string {
  const total = calls.snapshot + calls.watcher + calls.thinSpec;
  const token = calls.token === "app" ? "the GitHub App's token" : "the shared token";
  return `${total} GitHub calls on ${token} (snapshot ${calls.snapshot}, watcher ${calls.watcher}, thin-spec ${calls.thinSpec})`;
}

/**
 * Logs a pass and saves its metrics. In a dry run `done` and `woken` count
 * what it would have done. A metric that doesn't save is logged, not thrown.
 */
async function recordPass(
  ctx: JobApi,
  companyId: string,
  dryRun: boolean,
  { summary, monitors, calls, durationMs }: PassCounts,
): Promise<void> {
  const failure = await writeMetrics(
    ctx,
    {
      "pr_watcher.tasks_with_pr": summary.checked,
      "pr_watcher.done": summary.done,
      "pr_watcher.woken": summary.woken,
      "pr_watcher.failed": summary.failed.length,
      "pr_watcher.handed_off": summary.handedOff,
      "pr_watcher.warned_after_approval": summary.warned,
      "pr_watcher.review_waits": summary.reviewWaits,
      "pr_watcher.review_priority_raised": summary.priorityRaised,
      "pr_watcher.review_rerouted": summary.rerouted,
      "pr_watcher.review_both_limited": summary.bothLimited,
      "pr_watcher.github_requests": calls.snapshot + calls.watcher + calls.thinSpec,
      "pr_watcher.github_requests_snapshot": calls.snapshot,
      "pr_watcher.duration_ms": durationMs,
      "monitors.set": monitors.set,
      "monitors.fired": monitors.fired,
      "monitors.set_on_pr_tasks": monitors.setOnPrTasks,
      "monitors.fired_on_pr_tasks": monitors.firedOnPrTasks,
      "monitors.postponed": summary.postponed,
      "monitors.postpone_refused": summary.postponeRefused,
    },
    { companyId, dryRun: String(dryRun) },
  );
  if (failure !== undefined) {
    ctx.logger.error(`PR watcher: couldn't save its metrics: ${failure.message}`, { companyId });
  }
  ctx.logger.info(
    `PR watcher: ${summary.checked} tasks with a pull request, ${summary.done} done, ${summary.woken} woken, ${summary.handedOff} handed to review, ${summary.warned} warned after approval, ${summary.reviewWaits} waiting for review over 1 h, ${summary.priorityRaised} raised to high, ${summary.rerouted} moved off a limited reviewer, ${summary.bothLimited} with both reviewers limited, ${summary.failed.length} failed, ${callsText(calls)}, ${monitors.firedOnPrTasks} monitors fired on those tasks, ${summary.postponed} moved later${dryRun ? " (dry run)" : ""}.`,
    { companyId },
  );
  // The top 5, so Chief's team check can list the longest review waits (HAL-17920).
  const longest = longestWaitingLine(summary.longestWaits);
  if (longest !== undefined) {
    ctx.logger.info(longest, { companyId });
  }
}

/**
 * The fast-track rules on the pass's snapshot, log only (phase 1). A failure
 * is logged and leaves the watcher's own work alone.
 */
async function runFastTrack(
  ctx: JobApi,
  companyId: string,
  snapshot: Snapshot,
  settings: WatcherSettings,
  now: Date,
): Promise<void> {
  try {
    const sharedScope = await sharedLabelScope(
      ctx.issues,
      companyId,
      snapshot,
      settings.fastTrackSharedLabelScope,
      sharedLabelAdder,
    );
    const pass = fastTrackPass(
      snapshot,
      await loadFastTrack(ctx, companyId),
      {
        unblocks: settings.fastTrackUnblocks,
        labelAdder: settings.fastTrackLabelAdder,
        sharedScope,
      },
      now,
    );
    for (const line of pass.lines) {
      ctx.logger.info(line, { companyId });
    }
    await saveFastTrack(ctx, companyId, pass.state);
  } catch (error) {
    ctx.logger.error(`Fast-track rules: couldn't run: ${(error as Error).message}`, { companyId });
  }
}

/**
 * The heads merge control holds after a failed merge group, from its last
 * pass's state (HAL-18147). A read that fails is logged and holds nothing,
 * so the watcher's other work goes on.
 */
async function heldOf(ctx: JobApi, companyId: string, repo: string): Promise<HeldHead[]> {
  try {
    return heldHeads(await ctx.state.get(passStateKey(companyId)), repo);
  } catch (error) {
    ctx.logger.error(
      `PR watcher: couldn't read merge control's holds: ${(error as Error).message}`,
      {
        companyId,
      },
    );
    return [];
  }
}

/** One watcher pass for one company. Returns how many tasks it couldn't check. */
async function watchCompany(
  ctx: JobApi,
  companyId: string,
  now: Date,
  lifecycle: LifecycleRunner | undefined,
  paperclipFetch: RunsFetch,
): Promise<number> {
  const settings = await companySettings(ctx, companyId);
  if (settings === undefined) {
    ctx.logger.info("PR watcher: no settings saved for this company, skipped.", { companyId });
    return 0;
  }
  if (settings.token === undefined) {
    ctx.logger.info("PR watcher: no GitHub token set for this company, skipped.", { companyId });
    return 0;
  }
  // Read at run time and never logged or kept (the SDK's secrets rule).
  const token = await ctx.secrets.resolve(settings.token, { companyId });
  const tokenKind: GitHubTokenKind = "shared";
  const { fetch, requests } = countingFetch((url, init) =>
    ctx.http.fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }),
  );
  const get = gitHubReader({ fetch, token });
  const query = gitHubQueryReader({ fetch, token });
  const fallback = (repo: string, sha: string, name: string) => ciOk(get, repo, sha, name);
  const started = Date.now();
  const taken = await takeSnapshot({
    // Only the shared token today; the read-only GitHub App's token replaces it here (HAL-16003).
    token: tokenKind,
    query,
    repos: settings.repos,
    now,
    fallback,
    unread: (repo, reason) =>
      ctx.logger.error(`PR watcher: left ${repo} out, the token doesn't reach it: ${reason}`, {
        companyId,
      }),
  });
  // Each open pull request's reviewer, so the tools that read only the snapshot name the shared one (HAL-19653).
  const snapshot = await addReviewers(ctx, companyId, taken, {
    repo: settings.repos[0] ?? defaultRepos[0] ?? "",
    get,
  });
  // The watcher works from the snapshot in memory; only its later readers miss a failed save.
  await saveSnapshot(ctx, companyId, snapshot).catch((error: unknown) => {
    ctx.logger.error(`PR watcher: couldn't save the GitHub snapshot: ${(error as Error).message}`, {
      companyId,
    });
  });
  const snapshotCalls = requests();
  const stackRebase = await stackRebaseOf({
    ctx,
    companyId,
    settings: settings.stackRebase,
    fetch,
    get,
    query,
    repo: settings.repos[0] ?? defaultRepos[0] ?? "",
  });
  await runFastTrack(ctx, companyId, snapshot, settings, now);
  await lifecycle?.run(companyId, snapshot);
  const found = discoverPulls(snapshot);
  const paperclip = paperclipHost(ctx, companyId, ctx.state);
  // Kept from the pass, so the monitors are counted without reading the tasks twice.
  let tasks: TaskRow[] = [];
  // What the watcher decided from, for the signal rule beside it (HAL-18197).
  const recorder = watcherRecorder();
  const log = (line: string) => ctx.logger.info(line, { companyId });
  const config = await companyConfig(ctx.config, companyId);
  const summary = await tick({
    paperclip: {
      ...paperclip,
      openTasks: async () => {
        tasks = await paperclip.openTasks();
        return tasks;
      },
    },
    discover: async () => found,
    // One read of each base branch's newest green run per pass, shared by every task.
    facts: snapshotFacts({ snapshot, query, fallback, greenSince: baseGreenSince(get) }),
    dryRun: settings.dryRun,
    log,
    now,
    // Each approval's Paperclip copy, shown in the wake lines (HAL-19324); detection only.
    summary: snapshotSummary(
      snapshot,
      await snapshotCopies(snapshot, paperclipCopies(ctx, companyId), log),
    ),
    route: gitHubRoute(get),
    rebaseOnly: gitHubRebaseOnly(get, stackRebase?.tried.baseOf),
    conflictFiles: gitHubConflictFiles(get),
    held: await heldOf(ctx, companyId, settings.repos[0] ?? defaultRepos[0] ?? ""),
    observe: recorder.observe,
    acted: recorder.acted,
    limits: reviewerLimitsOf(ctx, paperclipFetch, config, { companyId, now, log }),
    ...(stackRebase === undefined ? {} : { stackRebase }),
  });
  // After the watcher's tick, so a task it just marked done unblocks its dependents in the same pass.
  const unblocked = await unblockPass({
    paperclip: unblockHost(ctx, companyId),
    dryRun: settings.dryRun,
    log: (line) => ctx.logger.info(line, { companyId }),
  });
  const watcherCalls = requests() - snapshotCalls;
  // In dry run beside the watcher's tick, from what it read: logs only, and a failure is logged.
  const signalled = await prWatcherSignalPass(ctx, companyId, recorder, now);
  if (signalled !== undefined) {
    await lifecycle?.runPrWatcher(companyId, signalled);
  }
  // After the watcher's tick, from the tasks it read; a failure is logged inside.
  await runMergeWatchers(ctx, {
    companyId,
    snapshot,
    repo: settings.repos[0] ?? defaultRepos[0] ?? "",
    settings: settings.watchers,
    tasks,
    found,
    now,
  });
  // Server sessions' pull requests on their chief lines (HAL-18586); a failure is logged.
  await chiefLinePrPass(ctx, {
    companyId,
    settings: readChiefLineSettings(config),
    snapshot,
    get,
    watched: settings.repos,
    dryRun: settings.dryRun,
  }).catch((error: unknown) => {
    ctx.logger.error(`Chief line PRs: couldn't run: ${(error as Error).message}`, { companyId });
  });
  // After the watcher's own work, so a failure here never holds up a task.
  await recordThinSpecOutcomes(ctx, { companyId, snapshot, found, get, now }).catch(
    (error: unknown) => {
      ctx.logger.error(`Thin-spec outcome: couldn't run: ${(error as Error).message}`, {
        companyId,
      });
    },
  );
  const prTasks = new Set([...found].filter(([, pulls]) => pulls.length > 0).map(([id]) => id));
  await recordPass(ctx, companyId, settings.dryRun, {
    summary,
    // Parked tasks are read only for a retargeted pull request (HAL-17869); their monitors aren't the watcher's.
    monitors: countMonitors(
      tasks.filter((task) => task.parked !== true),
      prTasks,
      now,
    ),
    calls: {
      token: tokenKind,
      snapshot: snapshotCalls,
      watcher: watcherCalls,
      thinSpec: requests() - snapshotCalls - watcherCalls,
    },
    durationMs: Date.now() - started,
  });
  return summary.failed.length + unblocked.failed.length;
}

/**
 * One watcher pass for every company `companies` names that has a token
 * set. The worker runs it for one company at a time, inside that company's
 * dispatch event (see `scheduled.ts`). A company that fails is logged and
 * the others still run; the pass fails at the end, so the log shows it.
 * `paperclipFetch` reads reviewers' runs from Paperclip's API: Node's own
 * `fetch`, like the plugin's other Paperclip API calls (see reviewer-runs.ts).
 */
export async function runWatcher(
  ctx: JobApi,
  now: Date,
  companies: CompanySource = listedCompanies,
  lifecycle?: LifecycleRunner,
  paperclipFetch: RunsFetch = (url, init) => fetch(url, init),
): Promise<void> {
  let failed = 0;
  for (const companyId of await companies(ctx)) {
    try {
      failed += await watchCompany(ctx, companyId, now, lifecycle, paperclipFetch);
    } catch (error) {
      failed += 1;
      ctx.logger.error(`PR watcher: couldn't run: ${(error as Error).message}`, { companyId });
    }
  }
  if (failed > 0) {
    throw new Error(`PR watcher: ${failed} tasks or companies couldn't be checked; see the log.`);
  }
}
