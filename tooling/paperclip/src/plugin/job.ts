import {
  PLUGIN_RPC_ERROR_CODES,
  type PluginCompaniesClient,
  type PluginConfigClient,
  type PluginHttpClient,
  type PluginLogger,
  type PluginSecretsClient,
} from "@paperclipai/plugin-sdk";
import { discoverPulls } from "../pr-watcher/discover.ts";
import { baseGreenSince, snapshotFacts } from "../pr-watcher/facts.ts";
import { ciOk, gitHubReader } from "../pr-watcher/github.ts";
import { countMonitors, type MonitorCounts } from "../pr-watcher/monitors.ts";
import type { TaskRow } from "../pr-watcher/paperclip.ts";
import { type TickSummary, tick } from "../pr-watcher/watch.ts";
import { gitHubQueryReader } from "../snapshot/graphql.ts";
import { takeSnapshot } from "../snapshot/read.ts";
import { type StateApi, saveSnapshot } from "../snapshot/store.ts";
import { type HostApi, paperclipHost } from "./host.ts";
import { countingFetch, type MetricsApi, writeMetrics } from "./metrics.ts";

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
}

const defaultRepos = ["halonic-com/halonic"];

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

/** What one pass for one company counted. */
interface PassCounts {
  readonly summary: TickSummary;
  readonly monitors: MonitorCounts;
  readonly requests: number;
  readonly durationMs: number;
}

/**
 * Logs a pass and saves its metrics. In a dry run `done` and `woken` count
 * what it would have done. A metric that doesn't save is logged, not thrown.
 */
async function recordPass(
  ctx: JobApi,
  companyId: string,
  dryRun: boolean,
  { summary, monitors, requests, durationMs }: PassCounts,
): Promise<void> {
  const failure = await writeMetrics(
    ctx,
    {
      "pr_watcher.tasks_with_pr": summary.checked,
      "pr_watcher.done": summary.done,
      "pr_watcher.woken": summary.woken,
      "pr_watcher.failed": summary.failed.length,
      "pr_watcher.github_requests": requests,
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
    `PR watcher: ${summary.checked} tasks with a pull request, ${summary.done} done, ${summary.woken} woken, ${summary.failed.length} failed, ${requests} GitHub requests, ${monitors.firedOnPrTasks} monitors fired on those tasks, ${summary.postponed} moved later${dryRun ? " (dry run)" : ""}.`,
    { companyId },
  );
}

/** One watcher pass for one company. Returns how many tasks it couldn't check. */
async function watchCompany(ctx: JobApi, companyId: string, now: Date): Promise<number> {
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
  const { fetch, requests } = countingFetch((url, init) =>
    ctx.http.fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }),
  );
  const get = gitHubReader({ fetch, token });
  const query = gitHubQueryReader({ fetch, token });
  const fallback = (repo: string, sha: string, name: string) => ciOk(get, repo, sha, name);
  const started = Date.now();
  const snapshot = await takeSnapshot({ query, repos: settings.repos, now, fallback });
  // The watcher works from the snapshot in memory; only its later readers miss a failed save.
  await saveSnapshot(ctx, companyId, snapshot).catch((error: unknown) => {
    ctx.logger.error(`PR watcher: couldn't save the GitHub snapshot: ${(error as Error).message}`, {
      companyId,
    });
  });
  const found = discoverPulls(snapshot);
  const paperclip = paperclipHost(ctx, companyId);
  // Kept from the pass, so the monitors are counted without reading the tasks twice.
  let tasks: TaskRow[] = [];
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
    log: (line) => ctx.logger.info(line, { companyId }),
    now,
  });
  const prTasks = new Set([...found].filter(([, pulls]) => pulls.length > 0).map(([id]) => id));
  await recordPass(ctx, companyId, settings.dryRun, {
    summary,
    monitors: countMonitors(tasks, prTasks, now),
    requests: requests(),
    durationMs: Date.now() - started,
  });
  return summary.failed.length;
}

/**
 * The `pr-watch` job: one pass for every company that has a token set. A
 * company that fails is logged and the others still run; the job fails at
 * the end, so the job log shows it.
 */
export async function runWatcher(ctx: JobApi, now: Date): Promise<void> {
  let failed = 0;
  for (const company of await ctx.companies.list()) {
    try {
      failed += await watchCompany(ctx, company.id, now);
    } catch (error) {
      failed += 1;
      ctx.logger.error(`PR watcher: couldn't run: ${(error as Error).message}`, {
        companyId: company.id,
      });
    }
  }
  if (failed > 0) {
    throw new Error(`PR watcher: ${failed} tasks or companies couldn't be checked; see the log.`);
  }
}
