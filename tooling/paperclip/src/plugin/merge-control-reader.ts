import type {
  PluginConfigClient,
  PluginHttpClient,
  PluginIssuesClient,
  PluginLogger,
  PluginSecretsClient,
} from "@paperclipai/plugin-sdk";
import {
  type FactsCaches,
  type FactsSettings,
  factsCaches,
  readMergeFacts,
} from "../merge-control/facts.ts";
import { defaultSettings } from "../merge-control/state.ts";
import { gitHubReader } from "../pr-watcher/github.ts";
import type { PrioTask, TaskPriority } from "../rules/queue-prio.ts";
import { gitHubQueryReader } from "../snapshot/graphql.ts";
import { everyIssue } from "./host.ts";
import { companyConfig, readSettings, requestTimeoutMs } from "./job.ts";
import type { MergeFactsReader } from "./merge-control-job.ts";

/**
 * Builds merge control's facts reader from the plugin context: the
 * read-only GitHub token from the PR watcher's setting, the capacity
 * addresses and the Merger's login from merge control's settings, and the
 * tasks' priorities and blockers from Paperclip, read at most every
 * 10 minutes, as the fill order changes slowly.
 */

/** The part of the plugin context the reader uses, so tests can fake it. */
export interface MergeReaderApi {
  readonly config: PluginConfigClient;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly http: PluginHttpClient;
  readonly issues: Pick<PluginIssuesClient, "list"> & {
    readonly relations: Pick<PluginIssuesClient["relations"], "get">;
  };
  readonly logger: Pick<PluginLogger, "info">;
}

/**
 * Node's own `fetch` for the capacity addresses: they are private hosts,
 * which the host's outbound guard may refuse (as for the precheck service).
 */
export type PlainFetch = (
  url: string,
  init: { method: "GET"; headers: Record<string, string>; signal: AbortSignal },
) => Promise<Pick<Response, "ok" | "status" | "json">>;

/** How long the tasks read from Paperclip are kept. */
export const tasksTtlMinutes = 10;

/** The reader's settings and the token's secret, or undefined values where unset. */
export function readFactsSettings(config: Readonly<Record<string, unknown>>) {
  const section = (config["mergeControl"] ?? {}) as Record<string, unknown>;
  const text = (key: string, pattern: RegExp) => {
    const value = section[key];
    return typeof value === "string" && pattern.test(value.trim()) ? value.trim() : "";
  };
  const watcher = readSettings(config);
  const settings: FactsSettings = {
    repo: watcher.repos[0] ?? "halonic-com/halonic",
    mergerLogin: text("mergerLogin", /^[A-Za-z0-9-]{1,39}$/),
    capacity: {
      statusUrl: text("ciStatusUrl", /^https?:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/),
      prometheusUrl: text("prometheusUrl", /^https?:\/\/[\w.-]+(:\d+)?$/),
      queueLabel: defaultSettings.queueRunnerLabel,
    },
  };
  return { settings, token: watcher.token };
}

const priorities: readonly TaskPriority[] = ["critical", "high", "medium", "low"];

/** Open tasks for the fill order; only a blocked task's blockers are read. */
async function readTasks(ctx: MergeReaderApi, companyId: string): Promise<PrioTask[]> {
  const tasks: PrioTask[] = [];
  for (const issue of await everyIssue(ctx, companyId)) {
    if (issue.identifier === null) {
      continue;
    }
    const blockers =
      issue.status === "blocked"
        ? (await ctx.issues.relations.get(issue.id, companyId)).blockedBy
        : [];
    tasks.push({
      identifier: issue.identifier,
      status: issue.status,
      priority: priorities.find((priority) => priority === issue.priority),
      blockedBy: blockers.flatMap((blocker) => (blocker.identifier ? [blocker.identifier] : [])),
    });
  }
  return tasks;
}

/** A GET to a capacity address, no token; anything but a 2xx JSON answer throws. */
function plainGet(fetch: PlainFetch) {
  return async (url: string): Promise<unknown> => {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      throw new Error(`answered ${response.status}`);
    }
    return await response.json();
  };
}

/** The reader `mergeControlPass` takes, keeping each company's caches between passes. */
export function mergeFactsReader(ctx: MergeReaderApi, plainFetch: PlainFetch): MergeFactsReader {
  const companies = new Map<
    string,
    { caches: FactsCaches; tasks?: { at: number; list: PrioTask[] } }
  >();
  return async (companyId, now) => {
    const { settings, token } = readFactsSettings(
      (await companyConfig(ctx.config, companyId)) ?? {},
    );
    if (token === undefined) {
      throw new Error("no GitHub token set for this company, so no facts to read.");
    }
    const kept = companies.get(companyId) ?? { caches: factsCaches() };
    companies.set(companyId, kept);
    // Read at run time and never logged or kept (the SDK's secrets rule).
    const secret = await ctx.secrets.resolve(token, { companyId });
    const fetch = (
      url: string,
      init: { method: string; headers: Record<string, string>; body?: string },
    ) => ctx.http.fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });
    return await readMergeFacts(
      {
        query: gitHubQueryReader({ fetch, token: secret }),
        get: gitHubReader({ fetch, token: secret }),
        plainGet: plainGet(plainFetch),
        async tasks() {
          if (
            kept.tasks === undefined ||
            now.getTime() - kept.tasks.at >= tasksTtlMinutes * 60_000
          ) {
            kept.tasks = { at: now.getTime(), list: await readTasks(ctx, companyId) };
          }
          return kept.tasks.list;
        },
        settings,
        caches: kept.caches,
        log: (line) => ctx.logger.info(`Merge control: ${line}`, { companyId }),
      },
      now,
    );
  };
}
