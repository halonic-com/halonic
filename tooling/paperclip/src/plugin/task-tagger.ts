import { createHash } from "node:crypto";
import type {
  PluginCompaniesClient,
  PluginConfigClient,
  PluginEvent,
  PluginHealthDiagnostics,
  PluginIssuesClient,
  PluginLogger,
  PluginSecretsClient,
} from "@paperclipai/plugin-sdk";
import type { StateApi } from "../snapshot/store.ts";
import {
  type ReadyTaggerSettings,
  readTaskTaggerSettings,
  readyTagger,
} from "../task-tagger/settings.ts";
import {
  currentSpend,
  describeSpend,
  limitReached,
  type MonthSpend,
  withCall,
} from "../task-tagger/spend.ts";
import { isTaggerLabel, labelsFor, taskMessage } from "../task-tagger/verdict.ts";
import { errorCode } from "./board-check-api.ts";
import { setTaskLabels } from "./host.ts";
import { companyConfig } from "./job.ts";
import { manifest } from "./manifest.ts";
import { type MetricsApi, writeMetrics } from "./metrics.ts";
import { askHaiku, companyLabels } from "./task-tagger-calls.ts";

/**
 * The difficulty tagger (HAL-16928, HAL-16876 part 3): on a new task, and
 * when a task's title or description changes, it asks Haiku how hard the
 * task is and writes the labels `D1`–`D4` and `opus-only`, which the task
 * effort handler then maps to an effort. Labels someone else set win. Its
 * log and metrics name task identifiers, labels and codes, never task text
 * or a key.
 */

/** The part of the plugin context the tagger uses, so tests can fake it. */
export interface TaskTaggerApi extends MetricsApi, StateApi {
  readonly issues: Pick<PluginIssuesClient, "get" | "update">;
  readonly companies: Pick<PluginCompaniesClient, "list">;
  readonly config: PluginConfigClient;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly logger: Pick<PluginLogger, "info" | "warn" | "error">;
}

/** Node's own `fetch` (see task-effort.ts for why) and the clock; tests replace both. */
export interface TaskTaggerDeps {
  readonly fetch: typeof fetch;
  readonly now: () => Date;
}

/** What the tagger keeps per task between events. */
interface TagRecord {
  /** A hash of the text it last read, so only a change of title or description reads it again. */
  readonly hash: string;
  /** The labels it wrote and that are still its own. */
  readonly wrote: readonly string[];
  /** Someone else set a difficulty or `opus-only` label, so the tagger leaves the task alone. */
  readonly handsOff: boolean;
}

type Issue = NonNullable<Awaited<ReturnType<TaskTaggerApi["issues"]["get"]>>>;

function recordKey(taskId: string) {
  return { scopeKind: "issue", scopeId: taskId, namespace: "tagger", stateKey: "record" } as const;
}

function spendKey(companyId: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "tagger",
    stateKey: "spend",
  } as const;
}

function textHash(issue: Issue): string {
  return createHash("sha256").update(taskMessage(issue.title, issue.description)).digest("hex");
}

function sameLabels(left: readonly string[], right: readonly string[]): boolean {
  const sorted = (labels: readonly string[]) => [...labels].sort().join(",");
  return sorted(left) === sorted(right);
}

/** Logs a failure and counts it; `reason` is a short code, never an answer's text. */
async function fail(ctx: TaskTaggerApi, issue: Issue, what: string, reason: string) {
  const meta = { companyId: issue.companyId };
  ctx.logger.error(`Task tagger: ${what} for ${issue.identifier ?? issue.id} (${reason}).`, meta);
  await writeMetrics(ctx, { "task_tagger.failed": 1 }, { ...meta, reason });
}

/** The month's spend, or undefined after logging the stop once when the limit is reached. */
async function spendBeforeCall(
  ctx: TaskTaggerApi,
  companyId: string,
  now: Date,
): Promise<MonthSpend | undefined> {
  const spend = currentSpend((await ctx.state.get(spendKey(companyId))) as MonthSpend | null, now);
  if (!limitReached(spend)) {
    return spend;
  }
  if (!spend.stopReported) {
    ctx.logger.warn(`Task tagger: stopped for the month, ${describeSpend(spend)}.`, { companyId });
    await writeMetrics(ctx, { "task_tagger.limit_reached": 1 }, { companyId });
    await ctx.state.set(spendKey(companyId), { ...spend, stopReported: true });
  }
  return undefined;
}

/** Swaps the tagger's old labels for the new ones and keeps every other label. Returns a failure code. */
async function writeLabels(
  ctx: TaskTaggerApi,
  deps: TaskTaggerDeps,
  settings: ReadyTaggerSettings,
  issue: Issue,
  change: { readonly old: readonly string[]; readonly wanted: readonly string[] },
): Promise<string | undefined> {
  const apiKey = await ctx.secrets.resolve(settings.apiKey, { companyId: issue.companyId });
  const api = { url: settings.apiUrl, key: apiKey };
  const byName = await companyLabels(deps.fetch, api, issue.companyId);
  if (typeof byName === "string") {
    return byName;
  }
  const missing = change.wanted.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    return `missing_label:${missing.join("+")}`;
  }
  const kept = (issue.labels ?? []).filter((label) => !change.old.includes(label.name));
  const labelIds = [
    ...kept.map((label) => label.id),
    ...change.wanted.map((name) => byName.get(name) ?? ""),
  ];
  await setTaskLabels(ctx.issues, issue, labelIds);
  return undefined;
}

/**
 * Tags one task after its text changed and returns the record to keep. When
 * it couldn't tag (spend limit, a failed request), the record says the text
 * wasn't read yet, so the task's next event tries again.
 */
async function tag(
  ctx: TaskTaggerApi,
  deps: TaskTaggerDeps,
  settings: ReadyTaggerSettings,
  issue: Issue,
  record: TagRecord,
): Promise<TagRecord> {
  const unread = { ...record, hash: "" };
  const spend = await spendBeforeCall(ctx, issue.companyId, deps.now());
  if (spend === undefined) {
    return unread;
  }
  // Read at run time for this one call, never logged or kept (the SDK's secrets rule).
  const anthropicKey = await ctx.secrets.resolve(settings.anthropicKey, {
    companyId: issue.companyId,
  });
  const answer = await askHaiku(deps.fetch, anthropicKey, issue);
  if (!answer.ok) {
    await fail(ctx, issue, "couldn't ask Haiku", answer.reason);
    return unread;
  }
  await ctx.state.set(spendKey(issue.companyId), withCall(spend, answer.usd));
  if (answer.verdict === undefined) {
    await fail(ctx, issue, "couldn't read Haiku's answer", "unreadable");
    return record;
  }
  const wanted = labelsFor(answer.verdict);
  if (!sameLabels(wanted, record.wrote)) {
    const failure = await writeLabels(ctx, deps, settings, issue, { old: record.wrote, wanted });
    if (failure !== undefined) {
      await fail(ctx, issue, "couldn't write the labels", failure);
      return unread;
    }
  }
  const shown = wanted.length > 0 ? wanted.join(" ") : "no labels";
  const meta = { companyId: issue.companyId };
  ctx.logger.info(
    `Task tagger: ${issue.identifier ?? issue.id} is ${answer.verdict.kind}, ${shown}.`,
    meta,
  );
  await writeMetrics(ctx, { "task_tagger.tagged": 1 }, { ...meta, kind: answer.verdict.kind });
  return { ...record, wrote: wanted };
}

/** Handles one event for one task, start to finish. */
async function handle(
  ctx: TaskTaggerApi,
  deps: TaskTaggerDeps,
  event: PluginEvent,
  taskId: string,
  settings: ReadyTaggerSettings,
): Promise<void> {
  const issue = await ctx.issues.get(taskId, event.companyId);
  if (issue === null) {
    return;
  }
  const before = (await ctx.state.get(recordKey(taskId))) as TagRecord | null;
  const hash = textHash(issue);
  if (before?.hash === hash) {
    return;
  }
  const wrote = before?.wrote ?? [];
  const current = (issue.labels ?? []).map((label) => label.name).filter(isTaggerLabel);
  const handsOff =
    (before?.handsOff ?? false) || (current.length > 0 && !sameLabels(current, wrote));
  const record: TagRecord = { hash, wrote, handsOff };
  // A task first seen on an update may have had this text all along: keep it as the baseline.
  const firstSeenOnUpdate = before === null && event.eventType !== "issue.created";
  const next =
    handsOff || firstSeenOnUpdate ? record : await tag(ctx, deps, settings, issue, record);
  await ctx.state.set(recordKey(taskId), next);
}

/** The tagger for one plugin worker. */
export interface TaskTagger {
  /** A task was created or changed: tag it if its title or description is new. */
  onIssueEvent(event: PluginEvent): Promise<void>;
  /** This month's spend per company, for the plugin page. */
  health(): Promise<PluginHealthDiagnostics>;
}

/**
 * The tagger. Events of one company run one after another, so the month's
 * spend is read and added to by one call at a time, and the `issue.updated`
 * its own label write causes is read after its record is saved.
 */
export function taskTagger(ctx: TaskTaggerApi, deps: TaskTaggerDeps): TaskTagger {
  const running = new Map<string, Promise<void>>();
  return {
    async onIssueEvent(event) {
      const payload = (event.payload ?? {}) as { id?: unknown };
      const taskId = event.entityId ?? (typeof payload.id === "string" ? payload.id : undefined);
      if (taskId === undefined) {
        return;
      }
      const work = async () => {
        try {
          const config = await companyConfig(ctx.config, event.companyId);
          const settings =
            config === undefined
              ? undefined
              : readyTagger(readTaskTaggerSettings(config), manifest.version);
          if (settings !== undefined) {
            await handle(ctx, deps, event, taskId, settings);
          }
        } catch (error) {
          ctx.logger.error(`Task tagger: couldn't handle a task event (${errorCode(error)}).`, {
            companyId: event.companyId,
          });
        }
      };
      const next = (running.get(event.companyId) ?? Promise.resolve()).then(work);
      running.set(event.companyId, next);
      await next;
      if (running.get(event.companyId) === next) {
        running.delete(event.companyId);
      }
    },
    async health() {
      const lines: string[] = [];
      let stopped = false;
      for (const company of await ctx.companies.list()) {
        const stored = (await ctx.state.get(spendKey(company.id))) as MonthSpend | null;
        const spend = currentSpend(stored, deps.now());
        stopped ||= limitReached(spend);
        const state = limitReached(spend) ? "stopped for the month" : "tagging";
        lines.push(`${company.name}: ${state}, ${describeSpend(spend)}`);
      }
      return {
        status: stopped ? "degraded" : "ok",
        message: `Task tagger (Haiku): ${lines.length > 0 ? lines.join("; ") : "no companies"}.`,
        details: { taskTagger: lines },
      };
    },
  };
}
