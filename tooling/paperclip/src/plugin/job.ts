import {
  PLUGIN_RPC_ERROR_CODES,
  type PluginCompaniesClient,
  type PluginConfigClient,
  type PluginHttpClient,
  type PluginLogger,
  type PluginSecretsClient,
} from "@paperclipai/plugin-sdk";
import { discoverPulls } from "../pr-watcher/discover.ts";
import { gitHubReader } from "../pr-watcher/github.ts";
import { tick } from "../pr-watcher/watch.ts";
import { type HostApi, paperclipHost } from "./host.ts";

/** The part of the plugin context the job uses, so tests can fake it. */
export interface JobApi extends HostApi {
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
 * Reads a company's settings, or undefined when the board saved none for it.
 * A scheduled job runs outside any company, and the host then lets the
 * plugin read only the companies it has saved settings for; any other
 * company is refused with `INVOCATION_SCOPE_DENIED`.
 */
async function companySettings(
  ctx: JobApi,
  companyId: string,
): Promise<WatcherSettings | undefined> {
  try {
    return readSettings(await ctx.config.get(companyId));
  } catch (error) {
    if ((error as { code?: unknown }).code === PLUGIN_RPC_ERROR_CODES.INVOCATION_SCOPE_DENIED) {
      return undefined;
    }
    throw error;
  }
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
  const get = gitHubReader({
    fetch: (url, init) =>
      ctx.http.fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }),
    token,
  });
  const summary = await tick({
    paperclip: paperclipHost(ctx, companyId),
    get,
    discover: () => discoverPulls(get, settings.repos, now),
    dryRun: settings.dryRun,
    log: (line) => ctx.logger.info(line, { companyId }),
  });
  ctx.logger.info(
    `PR watcher: ${summary.checked} tasks with a pull request, ${summary.done} done, ${summary.woken} woken, ${summary.failed.length} failed${settings.dryRun ? " (dry run)" : ""}.`,
    { companyId },
  );
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
