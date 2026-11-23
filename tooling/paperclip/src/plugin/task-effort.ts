import type {
  PluginAgentsClient,
  PluginConfigClient,
  PluginEvent,
  PluginIssuesClient,
  PluginLogger,
  PluginSecretsClient,
} from "@paperclipai/plugin-sdk";
import type { StateApi } from "../snapshot/store.ts";
import {
  decideEffort,
  type EffortRecord,
  type ForeignChange,
  isApproval,
  type TaskNow,
} from "../task-effort/decide.ts";
import { isPaperclipEffort, paperclipEfforts } from "../task-effort/rules.ts";
import {
  readTaskEffortSettings,
  type TaskEffortSettings,
  taskEffortWritesOn,
} from "../task-effort/settings.ts";
import { errorCode } from "./board-check-api.ts";
import { companyConfig } from "./job.ts";
import { manifest } from "./manifest.ts";
import { type MetricsApi, writeMetrics } from "./metrics.ts";

/**
 * The task effort handler (HAL-16876, HAL-16866 steps 2–3): on a task's
 * `issue.created` and `issue.updated` it sets the task's thinking effort
 * from its tags and reports every effort change it didn't make. Its log and
 * metrics name task identifiers, efforts and actor types, never task text.
 */

/** The part of the plugin context the handler uses, so tests can fake it. */
export interface TaskEffortApi extends MetricsApi, StateApi {
  readonly issues: Pick<PluginIssuesClient, "get" | "listComments">;
  readonly agents: Pick<PluginAgentsClient, "list">;
  readonly config: PluginConfigClient;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly logger: Pick<PluginLogger, "info" | "warn" | "error">;
}

/**
 * Node's own `fetch`, not `ctx.http.fetch`: Paperclip's API is a private host,
 * which the host's outbound guard may refuse. The address comes only from the
 * plugin's settings. Tests replace it.
 */
export interface TaskEffortDeps {
  readonly fetch: typeof fetch;
}

/** How long the task change may take. */
const requestTimeoutMs = 15_000;

/** A task as the host hands it over; only the fields the handler reads. */
type Issue = NonNullable<Awaited<ReturnType<TaskEffortApi["issues"]["get"]>>>;

function recordKey(taskId: string) {
  return { scopeKind: "issue", scopeId: taskId, namespace: "effort", stateKey: "record" } as const;
}

/** An effort as it may appear in a log line: one of Paperclip's words, never free text. */
function shown(effort: string | null): string {
  if (effort === null) {
    return "none";
  }
  return isPaperclipEffort(effort) ? effort : "other";
}

function effortIn(overrides: Issue["assigneeAdapterOverrides"] | undefined): string | null {
  const effort = overrides?.adapterConfig?.["effort"];
  return typeof effort === "string" ? effort : null;
}

/**
 * The task's effort as the event saw it: from the event's payload when it
 * carries the overrides, so a change undone before the handler gets to it is
 * still reported, and otherwise from the task as it is now.
 */
function effortAtEvent(event: PluginEvent, issue: Issue): string | null {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  if (!("assigneeAdapterOverrides" in payload)) {
    return effortIn(issue.assigneeAdapterOverrides);
  }
  const overrides = payload["assigneeAdapterOverrides"];
  return typeof overrides === "object"
    ? effortIn(overrides as Issue["assigneeAdapterOverrides"])
    : null;
}

/** Whether two override values are the same, field for field. */
function sameOverrides(
  a: Issue["assigneeAdapterOverrides"],
  b: Issue["assigneeAdapterOverrides"],
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** The task's overrides with the effort replaced, or taken off when `effort` is null. */
export function withTaskEffort(
  overrides: Issue["assigneeAdapterOverrides"],
  effort: string | null,
): Record<string, unknown> | null {
  const { effort: _old, ...adapterConfig } = overrides?.adapterConfig ?? {};
  const config = effort === null ? adapterConfig : { ...adapterConfig, effort };
  const { adapterConfig: _config, ...rest } = overrides ?? {};
  const next = Object.keys(config).length > 0 ? { ...rest, adapterConfig: config } : rest;
  return Object.keys(next).length > 0 ? next : null;
}

/** Raised, lowered, set, removed, or changed when either side isn't one of Paperclip's words, for the metric's tag. */
function direction(change: ForeignChange): string {
  if (change.from === null) {
    return "set";
  }
  if (change.to === null) {
    return "removed";
  }
  if (!(isPaperclipEffort(change.from) && isPaperclipEffort(change.to))) {
    return "changed";
  }
  const rank = (effort: string) => paperclipEfforts.indexOf(effort as never);
  return rank(change.to) > rank(change.from) ? "raised" : "lowered";
}

/** Whether the agent is one of the reviewers in the settings. */
async function isReviewer(
  ctx: TaskEffortApi,
  companyId: string,
  agentId: string | null,
  settings: TaskEffortSettings,
): Promise<boolean> {
  if (agentId === null) {
    return false;
  }
  const agents = await ctx.agents.list({ companyId, limit: 500 });
  const agent = agents.find((candidate) => candidate.id === agentId);
  return agent !== undefined && settings.reviewers.includes(agent.urlKey);
}

/** Whether a reviewer just handed the task back without a signed approval as their newest comment. */
async function handedBackUnapproved(
  ctx: TaskEffortApi,
  issue: Issue,
  before: EffortRecord | undefined,
  settings: TaskEffortSettings,
): Promise<boolean> {
  const from = before?.assigneeAgentId ?? null;
  const to = issue.assigneeAgentId;
  if (from === null || to === null || from === to) {
    return false;
  }
  if (!(await isReviewer(ctx, issue.companyId, from, settings))) {
    return false;
  }
  const comments = await ctx.issues.listComments(issue.id, issue.companyId);
  const newest = comments
    .filter((comment) => comment.authorAgentId === from)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return newest !== undefined && !isApproval(newest.body);
}

async function reportForeign(
  ctx: TaskEffortApi,
  issue: Issue,
  change: ForeignChange,
  actorType: string,
): Promise<void> {
  const line = `Task effort: ${issue.identifier ?? issue.id} went from ${shown(change.from)} to ${shown(change.to)}, changed by an actor of type ${actorType}, not by the plugin; the plugin leaves this task's effort alone from now on.`;
  // Only the plugin, Chief or the board may set a task's effort (HAL-16866): an agent's change is an error.
  if (actorType === "agent") {
    ctx.logger.error(line, { companyId: issue.companyId, actorType });
  } else {
    ctx.logger.warn(line, { companyId: issue.companyId, actorType });
  }
  await writeMetrics(
    ctx,
    { "task_effort.foreign_change": 1 },
    { companyId: issue.companyId, actorType, direction: direction(change) },
  );
}

/** Why a write didn't go out: Paperclip refused it, or someone changed the overrides since the handler read them. */
type WriteFailure =
  | { readonly kind: "failed"; readonly code: string }
  | { readonly kind: "changed" };

/**
 * Sends the task change through Paperclip's own API. Core has no version
 * check on a task, so it reads the overrides again right before the PATCH
 * and sends nothing when they changed since `issue` was read: the PATCH
 * replaces all of them, and would undo a person's effort or model change.
 * That change's own `issue.updated` reports it.
 */
async function patchEffort(
  ctx: TaskEffortApi,
  deps: TaskEffortDeps,
  settings: TaskEffortSettings,
  issue: Issue,
  effort: string | null,
): Promise<WriteFailure | undefined> {
  if (settings.apiUrl === undefined || settings.apiKey === undefined) {
    return { kind: "failed", code: "not_configured" };
  }
  try {
    const fresh = await ctx.issues.get(issue.id, issue.companyId);
    if (
      fresh === null ||
      !sameOverrides(fresh.assigneeAdapterOverrides, issue.assigneeAdapterOverrides)
    ) {
      return { kind: "changed" };
    }
    // Read at run time and never logged or kept (the SDK's secrets rule).
    const key = await ctx.secrets.resolve(settings.apiKey, { companyId: issue.companyId });
    const response = await deps.fetch(
      `${settings.apiUrl}/api/issues/${encodeURIComponent(issue.id)}`,
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          assigneeAdapterOverrides: withTaskEffort(issue.assigneeAdapterOverrides, effort),
        }),
        signal: AbortSignal.timeout(requestTimeoutMs),
      },
    );
    return response.ok ? undefined : { kind: "failed", code: `http_${response.status}` };
  } catch (error) {
    return { kind: "failed", code: errorCode(error) };
  }
}

/** Writes the decided effort, or only logs it while the board's switch is off. Returns whether it went through. */
async function applyEffort(
  ctx: TaskEffortApi,
  deps: TaskEffortDeps,
  settings: TaskEffortSettings,
  issue: Issue,
  effort: string | null,
): Promise<boolean> {
  const name = issue.identifier ?? issue.id;
  const meta = { companyId: issue.companyId };
  if (!taskEffortWritesOn(settings, manifest.version)) {
    ctx.logger.info(`Task effort: would set ${name} to ${shown(effort)} (switch off).`, meta);
    await writeMetrics(ctx, { "task_effort.logged": 1 }, { ...meta, effort: shown(effort) });
    return false;
  }
  const failure = await patchEffort(ctx, deps, settings, issue, effort);
  if (failure?.kind === "changed") {
    ctx.logger.info(`Task effort: left ${name} alone, its overrides changed meanwhile.`, meta);
    await writeMetrics(ctx, { "task_effort.skipped": 1 }, meta);
    return false;
  }
  if (failure !== undefined) {
    const code = failure.code;
    ctx.logger.error(`Task effort: couldn't set ${name} to ${shown(effort)} (${code}).`, meta);
    await writeMetrics(ctx, { "task_effort.failed": 1 }, { ...meta, reason: code });
    return false;
  }
  ctx.logger.info(`Task effort: set ${name} to ${shown(effort)}.`, meta);
  await writeMetrics(ctx, { "task_effort.set": 1 }, { ...meta, effort: shown(effort) });
  return true;
}

/** Handles one event for one task, start to finish. */
async function handle(
  ctx: TaskEffortApi,
  deps: TaskEffortDeps,
  event: PluginEvent,
  taskId: string,
  settings: TaskEffortSettings,
): Promise<void> {
  const issue = await ctx.issues.get(taskId, event.companyId);
  if (issue === null) {
    return;
  }
  const stored = (await ctx.state.get(recordKey(taskId))) as EffortRecord | null;
  const before = stored ?? undefined;
  const task: TaskNow = {
    effort: effortAtEvent(event, issue),
    labelNames: (issue.labels ?? []).map((label) => label.name),
    assigneeAgentId: issue.assigneeAgentId,
  };
  const sentBackNow = await handedBackUnapproved(ctx, issue, before, settings);
  const created = event.eventType === "issue.created";
  const withReviewer = await isReviewer(ctx, issue.companyId, issue.assigneeAgentId, settings);
  const decision = decideEffort(task, before, { created, sentBackNow, withReviewer });
  if (decision.foreign !== undefined) {
    await reportForeign(ctx, issue, decision.foreign, event.actorType ?? "unknown");
  }
  let record = decision.record;
  if (decision.write !== undefined) {
    const wrote = await applyEffort(ctx, deps, settings, issue, decision.write);
    record = wrote ? decision.record : decision.recordUnwritten;
  }
  await ctx.state.set(recordKey(taskId), record);
}

/** The task effort handler for one plugin worker. */
export interface TaskEffort {
  /** A task was created or changed: set its effort from its tags and report a change the plugin didn't make. */
  onIssueEvent(event: PluginEvent): Promise<void>;
}

/**
 * The handler. Events for one task run one after another, so the
 * `issue.updated` its own write causes is read after its record is saved.
 */
export function taskEffort(ctx: TaskEffortApi, deps: TaskEffortDeps): TaskEffort {
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
          if (config !== undefined) {
            await handle(ctx, deps, event, taskId, readTaskEffortSettings(config));
          }
        } catch (error) {
          ctx.logger.error(`Task effort: couldn't handle a task event (${errorCode(error)}).`, {
            companyId: event.companyId,
          });
        }
      };
      const next = (running.get(taskId) ?? Promise.resolve()).then(work);
      running.set(taskId, next);
      await next;
      if (running.get(taskId) === next) {
        running.delete(taskId);
      }
    },
  };
}
