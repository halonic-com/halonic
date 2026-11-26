import type {
  PluginAgentsClient,
  PluginConfigClient,
  PluginHttpClient,
  PluginIssuesClient,
  PluginLogger,
  PluginSecretsClient,
} from "@paperclipai/plugin-sdk";
import { etagCache, passReader, ReadRefused } from "../merge-control/read-client.ts";
import { companyConfig, readSettings, requestTimeoutMs } from "./job.ts";
import { passTrigger, type TriggerTimers } from "./merge-control-trigger.ts";
import { changesBetween, type Prints, readPrints } from "./merger-wake-prints.ts";

/**
 * Wakes the live Merger when a pull request changes (HAL-19234), so a ready
 * pull request doesn't wait for its next heartbeat. The wake goes through the
 * Merger's own task (`mergerWake.task`), as the chief line wakes Chief, so the
 * woken run has the Merger's own responsible user and credential.
 *
 * Each pass reads the open pull requests' prints (merger-wake-prints.ts) on
 * the read token and compares them with the last pass's. The `merger-wake`
 * job asks for a pass every minute; the chief line's `pr-event` route asks
 * for one 10 seconds after a webhook delivery, and a signed approval counts
 * as a change by itself, as GitHub's review decision doesn't see it. A
 * change wakes the Merger at most once every 45 seconds, and not while a
 * Merger run is in progress: it waits for the next pass. The Merger's own
 * heartbeat stays as the fallback. A GitHub rate limit pauses the passes
 * until the limit resets, with one log line.
 */

/** At most one wake in this long. */
export const wakeEveryMs = 45_000;
/** A webhook delivery's pass waits this long, so a burst of deliveries reads GitHub once. */
export const nudgeWaitMs = 10_000;
/** How long a rate limit pauses the passes when GitHub names no reset time. */
export const backoffMs = 15 * 60_000;

/** The settings this reads, under `mergerWake`. */
export interface MergerWakeSettings {
  readonly enabled: boolean;
  /** The id of the Merger's task the wake goes to. */
  readonly task: string;
}

/** Reads `mergerWake`; it is on only with the switch on and a task set. */
export function readMergerWakeSettings(config: Readonly<Record<string, unknown>>) {
  const section = (config["mergerWake"] ?? {}) as Record<string, unknown>;
  const task = typeof section["task"] === "string" ? section["task"].trim() : "";
  const settings: MergerWakeSettings = {
    enabled: section["enabled"] === true && task !== "",
    task,
  };
  return settings;
}

/** The part of the plugin context the Merger wake uses, so tests can fake it. */
export interface MergerWakeApi {
  readonly config: PluginConfigClient;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly http: Pick<PluginHttpClient, "fetch">;
  readonly issues: Pick<PluginIssuesClient, "get" | "requestWakeup">;
  readonly agents: Pick<PluginAgentsClient, "get">;
  readonly logger: Pick<PluginLogger, "info" | "warn" | "error">;
}

/** Reads one repository's prints with a company's read token. */
export type PrintsReader = (
  companyId: string,
  repo: string,
  token: NonNullable<ReturnType<typeof readSettings>["token"]>,
) => Promise<Prints>;

/** What the `pr-event` route tells the Merger wake about a delivery. */
export type MergerNudge = (
  companyId: string,
  pull: { readonly repo: string; readonly number: number; readonly approval: boolean },
) => void;

/** The prints reader on GitHub's GraphQL API, one pass reader per read. */
export function gitHubPrints(ctx: MergerWakeApi): PrintsReader {
  return async (companyId, repo, token) => {
    const reader = await passReader({
      fetch: (url, init) =>
        ctx.http.fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }),
      // Read at run time and never logged or kept past the read (the SDK's secrets rule).
      token: () => ctx.secrets.resolve(token, { companyId }),
      etags: etagCache(),
    });
    try {
      return await readPrints(reader.query, repo);
    } catch (error) {
      if (error instanceof ReadRefused) {
        error.calls = reader.calls();
      }
      throw error;
    }
  };
}

/** What one company's passes remember between them. */
interface CompanyState {
  prints?: Prints;
  /** Changes no wake has carried yet. */
  pending: string[];
  /** Approvals from webhook deliveries, by repository, until the next pass. */
  approvals: { readonly repo: string; readonly number: number }[];
  lastWakeAt?: number;
  pausedUntil?: number | undefined;
  retryQueued: boolean;
  noTokenLogged: boolean;
}

/** A rate limit's reset time (ms) or null, or undefined for any other error. */
function rateLimitOf(error: unknown): { readonly until: number | null } | undefined {
  if (error instanceof ReadRefused) {
    const resetAt = error.calls?.resetAt;
    return { until: resetAt == null ? null : Date.parse(resetAt) };
  }
  // GitHub answers a GraphQL query over the limit with 200 and a RATE_LIMITED error.
  return error instanceof Error && /rate limit/i.test(error.message) ? { until: null } : undefined;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The Merger wake: `pass` is the `merger-wake` job's pass, `nudge` is what the
 * `pr-event` route calls. `request` asks the job for one more pass.
 */
export function mergerWake(
  ctx: MergerWakeApi,
  deps: {
    readonly readPrints: PrintsReader;
    readonly request: (companyId: string) => Promise<void>;
    readonly timers?: TriggerTimers;
  },
) {
  const timers = deps.timers ?? globalThis;
  const companies = new Map<string, CompanyState>();
  const stateOf = (companyId: string) => {
    const known = companies.get(companyId);
    if (known !== undefined) {
      return known;
    }
    const fresh: CompanyState = {
      pending: [],
      approvals: [],
      retryQueued: false,
      noTokenLogged: false,
    };
    companies.set(companyId, fresh);
    return fresh;
  };
  const askAgain = (companyId: string) =>
    deps.request(companyId).catch((error: unknown) => {
      ctx.logger.error(`Merger wake: couldn't start a pass: ${messageOf(error)}`, { companyId });
    });
  const trigger = passTrigger(
    (companyId) => askAgain(companyId),
    () => {},
    timers,
    nudgeWaitMs,
  );

  /** Why the Merger can't be woken now, or undefined when it can. */
  async function busy(companyId: string, task: string): Promise<string | undefined> {
    const issue = await ctx.issues.get(task, companyId);
    if (issue === null) {
      return "its task isn't there";
    }
    if (issue.activeRun != null) {
      return "a run on its task is in progress";
    }
    if (issue.assigneeAgentId == null) {
      return "its task has no assignee";
    }
    const agent = await ctx.agents.get(issue.assigneeAgentId, companyId);
    return agent?.status === "running" ? "a Merger run is in progress" : undefined;
  }

  /** Wakes the Merger for the pending changes, unless a wake was too recent or it is busy. */
  async function wakeIfDue(companyId: string, task: string, state: CompanyState, now: number) {
    if (state.pending.length === 0) {
      return;
    }
    const since = state.lastWakeAt === undefined ? wakeEveryMs : now - state.lastWakeAt;
    if (since < wakeEveryMs) {
      if (!state.retryQueued) {
        state.retryQueued = true;
        timers.setTimeout(() => {
          state.retryQueued = false;
          void askAgain(companyId);
        }, wakeEveryMs - since);
      }
      return;
    }
    const reason = await busy(companyId, task);
    if (reason !== undefined) {
      ctx.logger.info(`Merger wake: not now, ${reason}; the next pass tries again.`, { companyId });
      return;
    }
    state.lastWakeAt = now;
    const changes = state.pending.splice(0);
    try {
      await ctx.issues.requestWakeup(task, companyId, {
        reason: "merger_pr_change",
        idempotencyKey: `merger-wake ${new Date(now).toISOString()}`,
      });
      ctx.logger.info(`Merger wake: woke the Merger for ${changes.join("; ")}.`, { companyId });
    } catch (error) {
      ctx.logger.error(`Merger wake: couldn't wake the Merger: ${messageOf(error)}`, { companyId });
    }
  }

  /** Reads the prints, or logs why it couldn't and pauses on a rate limit. */
  async function readOrPause(
    companyId: string,
    config: Readonly<Record<string, unknown>>,
    state: CompanyState,
    at: number,
  ): Promise<{ readonly repo: string; readonly prints: Prints } | undefined> {
    const { token, repos } = readSettings(config);
    const repo = repos[0] ?? "halonic-com/halonic";
    if (token === undefined) {
      if (!state.noTokenLogged) {
        state.noTokenLogged = true;
        ctx.logger.error("Merger wake: no GitHub token set, so nothing to read.", { companyId });
      }
      return undefined;
    }
    try {
      const prints = await deps.readPrints(companyId, repo, token);
      state.pausedUntil = undefined;
      return { repo, prints };
    } catch (error) {
      const limit = rateLimitOf(error);
      if (limit === undefined) {
        ctx.logger.error(`Merger wake: couldn't read the pull requests: ${messageOf(error)}`, {
          companyId,
        });
        return undefined;
      }
      state.pausedUntil = Math.max(limit.until ?? at + backoffMs, at + 60_000);
      const until = new Date(state.pausedUntil).toISOString().slice(11, 16);
      ctx.logger.warn(`Merger wake: paused until ${until} UTC: ${messageOf(error)}`, { companyId });
      return undefined;
    }
  }

  async function pass(companyId: string, now: Date): Promise<void> {
    const config = (await companyConfig(ctx.config, companyId)) ?? {};
    const settings = readMergerWakeSettings(config);
    if (!settings.enabled) {
      companies.delete(companyId);
      return;
    }
    const state = stateOf(companyId);
    const at = now.getTime();
    if (state.pausedUntil !== undefined && at < state.pausedUntil) {
      return;
    }
    const read = await readOrPause(companyId, config, state, at);
    if (read === undefined) {
      return;
    }
    const { repo, prints } = read;
    if (state.prints !== undefined) {
      state.pending.push(...changesBetween(state.prints, prints));
    }
    state.prints = prints;
    for (const approval of state.approvals.splice(0)) {
      if (approval.repo === repo) {
        state.pending.push(`#${approval.number} approval`);
      }
    }
    await wakeIfDue(companyId, settings.task, state, at);
  }

  const nudge: MergerNudge = (companyId, pull) => {
    if (pull.approval) {
      stateOf(companyId).approvals.push({ repo: pull.repo, number: pull.number });
    }
    trigger(companyId);
  };

  return { pass, nudge };
}
