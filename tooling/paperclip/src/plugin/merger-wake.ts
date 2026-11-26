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
 * pull request doesn't wait for its next heartbeat. `mergerWake.task` names a
 * task the Merger holds; the wake starts a run of that task's holder with no
 * task, as its heartbeat does, so the run has the same responsible user and
 * credential as a timer run, and its prompt asks for one pass. (A wake on the
 * task itself made a run about that task, which never ran a pass.)
 *
 * Each pass reads the open pull requests' prints (merger-wake-prints.ts) on
 * the read token and compares them with the last pass's. The `merger-wake`
 * job asks for a pass every minute; the chief line's `pr-event` route asks
 * for one 10 seconds after a webhook delivery, and a signed approval counts
 * as a change by itself, as GitHub's review decision doesn't see it. A
 * change wakes the Merger at most once every 45 seconds, not while a Merger
 * run is in progress, and not when its timer pass is due within 30 seconds,
 * since the Merger has one run slot and a wake must never hold off the timer
 * pass (26 Nov, woken runs did): it waits for the next pass. Within 45 seconds of
 * a wake, or while the Merger is busy, a pass doesn't read GitHub at all, so
 * the shared token isn't spent when no wake can follow. The Merger's own
 * heartbeat stays as the fallback. A GitHub rate limit pauses the passes
 * until the limit resets, with one log line.
 */

/** At most one wake in this long. */
export const wakeEveryMs = 45_000;
/** A webhook delivery's pass waits this long, so a burst of deliveries reads GitHub once. */
export const nudgeWaitMs = 10_000;
/** How long a rate limit pauses the passes when GitHub names no reset time. */
export const backoffMs = 15 * 60_000;
/** No wake when the Merger's timer pass is due within this long, so a wake never holds it off. */
export const timerPassMarginMs = 30_000;

/** The heartbeat fields of an agent that this reads. */
interface HeartbeatClock {
  readonly runtimeConfig: Readonly<Record<string, unknown>>;
  readonly lastHeartbeatAt: Date | string | null;
}

/**
 * In how many ms the agent's next timer heartbeat is due (negative when it is
 * overdue), or undefined when it has no timer heartbeat or hasn't run yet.
 */
export function timerPassDueInMs(agent: HeartbeatClock, now: number) {
  const heartbeat = (agent.runtimeConfig["heartbeat"] ?? {}) as Record<string, unknown>;
  const intervalSec = heartbeat["intervalSec"];
  if (heartbeat["enabled"] === false || typeof intervalSec !== "number" || intervalSec <= 0) {
    return undefined;
  }
  if (agent.lastHeartbeatAt === null) {
    return undefined;
  }
  return new Date(agent.lastHeartbeatAt).getTime() + intervalSec * 1000 - now;
}

/** The woken run's prompt: one pass, as on a timer heartbeat, for these changes. */
export function passPrompt(changes: readonly string[]) {
  return [
    `Merger wake (Agent tools plugin, HAL-19234): ${changes.join("; ")}.`,
    "Run one full pass now, exactly as on a timer heartbeat (MERGER.md: `pass.js`), then end the run.",
  ].join("\n");
}

/** The settings this reads, under `mergerWake`. */
export interface MergerWakeSettings {
  readonly enabled: boolean;
  /** The id of a task the Merger holds; the wake goes to that task's holder. */
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
  readonly issues: Pick<PluginIssuesClient, "get">;
  readonly agents: Pick<PluginAgentsClient, "get" | "invoke">;
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

  /** The Merger's agent id, or why it can't be woken now. */
  async function merger(
    companyId: string,
    task: string,
    now: number,
  ): Promise<{ readonly agentId: string } | { readonly busy: string }> {
    const issue = await ctx.issues.get(task, companyId);
    if (issue === null) {
      return { busy: "its task isn't there" };
    }
    if (issue.activeRun != null) {
      return { busy: "a run on its task is in progress" };
    }
    if (issue.assigneeAgentId == null) {
      return { busy: "its task has no assignee" };
    }
    const agent = await ctx.agents.get(issue.assigneeAgentId, companyId);
    if (agent === null) {
      return { busy: "its holder isn't there" };
    }
    if (agent.status === "running") {
      return { busy: "a Merger run is in progress" };
    }
    const dueInMs = timerPassDueInMs(agent, now);
    return dueInMs !== undefined && dueInMs < timerPassMarginMs
      ? { busy: `its timer pass is due in ${Math.max(0, Math.round(dueInMs / 1000))} s` }
      : { agentId: issue.assigneeAgentId };
  }

  /** Whether a wake within the last 45 seconds holds this pass back; then one pass follows at the mark. */
  function tooSoon(companyId: string, state: CompanyState, now: number) {
    const since = state.lastWakeAt === undefined ? wakeEveryMs : now - state.lastWakeAt;
    if (since >= wakeEveryMs) {
      return false;
    }
    if (!state.retryQueued) {
      state.retryQueued = true;
      timers.setTimeout(() => {
        state.retryQueued = false;
        void askAgain(companyId);
      }, wakeEveryMs - since);
    }
    return true;
  }

  /** Wakes the Merger for the pending changes; on an error they stay pending for the next pass. */
  async function wake(companyId: string, agentId: string, state: CompanyState, now: number) {
    state.lastWakeAt = now;
    const changes = state.pending.splice(0);
    try {
      await ctx.agents.invoke(agentId, companyId, {
        prompt: passPrompt(changes),
        reason: "merger_pr_change",
      });
      ctx.logger.info(`Merger wake: woke the Merger for ${changes.join("; ")}.`, { companyId });
    } catch (error) {
      state.pending.unshift(...changes);
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

  /**
   * The Merger's agent id when a wake could follow this pass, or undefined when
   * a recent wake, a rate limit or a Merger run holds it back.
   */
  async function wakeable(companyId: string, task: string, state: CompanyState, at: number) {
    if (state.pausedUntil !== undefined && at < state.pausedUntil) {
      return undefined;
    }
    if (tooSoon(companyId, state, at)) {
      return undefined;
    }
    const target = await merger(companyId, task, at);
    if (!("busy" in target)) {
      return target.agentId;
    }
    if (state.pending.length > 0 || state.approvals.length > 0) {
      ctx.logger.info(`Merger wake: not now, ${target.busy}; the next pass tries again.`, {
        companyId,
      });
    }
    return undefined;
  }

  /** Adds the changes since the last read and the approvals since then to the pending ones. */
  function record(state: CompanyState, repo: string, prints: Prints) {
    if (state.prints !== undefined) {
      state.pending.push(...changesBetween(state.prints, prints));
    }
    state.prints = prints;
    for (const approval of state.approvals.splice(0)) {
      if (approval.repo === repo) {
        state.pending.push(`#${approval.number} approval`);
      }
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
    const agentId = await wakeable(companyId, settings.task, state, at);
    if (agentId === undefined) {
      return;
    }
    const read = await readOrPause(companyId, config, state, at);
    if (read === undefined) {
      return;
    }
    record(state, read.repo, read.prints);
    if (state.pending.length > 0) {
      await wake(companyId, agentId, state, at);
    }
  }

  const nudge: MergerNudge = (companyId, pull) => {
    if (pull.approval) {
      stateOf(companyId).approvals.push({ repo: pull.repo, number: pull.number });
    }
    trigger(companyId);
  };

  return { pass, nudge };
}
