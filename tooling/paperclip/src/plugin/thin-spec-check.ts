import type { PluginEvent } from "@paperclipai/plugin-sdk";
import { type MonthSpend, overLimit, spendFor, spendMonth } from "../difficulty-tagger/spend.ts";
import { clarifyDescription, clarifyTitle, isClarifyTask } from "../thin-spec/clarify.ts";
import { taskText } from "../thin-spec/reading.ts";
import { flagThreshold, thinSpecScore } from "../thin-spec/score.ts";
import {
  type ActiveThinSpecSettings,
  readThinSpecSettings,
  thinSpecOn,
} from "../thin-spec/settings.ts";
import { errorCode } from "./board-check-api.ts";
import { companyConfig } from "./job.ts";
import { manifest } from "./manifest.ts";
import { writeMetrics } from "./metrics.ts";
import {
  addClarifyStep,
  askReading,
  type ThinSpecApi,
  type ThinSpecDeps,
} from "./thin-spec-calls.ts";

/**
 * The thin-spec check (HAL-17076, board request HAL-17072): when an agent is
 * assigned a new code task, Haiku reads its text and a small model scores how
 * likely the text leaves out the expected result. A flagged task gets a
 * "Clarify acceptance criteria" task for its requester, and waits for it. The
 * check is additive: it never rewrites or reassigns the writer's task, and an
 * unflagged task is left alone. Every check is logged by day for the week's
 * read-out. Logs and metrics name task identifiers and scores, never task text.
 */

type Issue = NonNullable<Awaited<ReturnType<ThinSpecApi["issues"]["get"]>>>;

/** A task counts as new for a day after it was created, so turning the check on doesn't sweep old tasks. */
const newTaskMs = 24 * 60 * 60 * 1000;

/** The writer hasn't started yet. */
const waitingStatuses = new Set(["backlog", "todo"]);

/** What the check logs about one task, kept on the task and in the day's log. */
export interface CheckRecord {
  readonly taskId: string;
  readonly identifier: string;
  readonly checkedAt: string;
  readonly flagged: boolean;
  readonly score: number;
  /** The clarify task, when one was added. */
  readonly clarifyId?: string;
  /** Why a flagged task got no clarify task (`writer_started` when its run had already begun). */
  readonly clarifyFailure?: string;
}

function recordKey(taskId: string) {
  return {
    scopeKind: "issue",
    scopeId: taskId,
    namespace: "thin-spec",
    stateKey: "record",
  } as const;
}

/** One list per company and UTC day, so a week reads out as seven entries. */
export function dayLogKey(companyId: string, day: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "thin-spec",
    stateKey: `log-${day}`,
  } as const;
}

function spendKey(companyId: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "thin-spec",
    stateKey: "spend",
  } as const;
}

async function reportFailure(ctx: ThinSpecApi, companyId: string, line: string, reason: string) {
  ctx.logger.error(`Thin-spec check: ${line}`, { companyId });
  await writeMetrics(ctx, { "thin_spec.failed": 1 }, { companyId, reason });
}

/** Whether this is a code task an agent was just given and hasn't started. */
function isNewCodingTask(issue: Issue, now: Date): boolean {
  const labels = (issue.labels ?? []).map((label) => label.name.trim().toLowerCase());
  const createdMs = new Date(issue.createdAt).getTime();
  return (
    typeof issue.assigneeAgentId === "string" &&
    waitingStatuses.has(issue.status) &&
    labels.some((label) => /^d[1-4]$/.test(label)) &&
    !isClarifyTask(issue.title) &&
    now.getTime() - createdMs <= newTaskMs
  );
}

/** Who clarifies: the agent that asked for the task, or the board's clarifier (a PM agent). */
async function clarifierFor(
  ctx: ThinSpecApi,
  settings: ActiveThinSpecSettings,
  issue: Issue,
): Promise<string | undefined> {
  const requester = issue.createdByAgentId;
  if (typeof requester === "string" && requester !== issue.assigneeAgentId) {
    return requester;
  }
  if (settings.clarifier === undefined) {
    return undefined;
  }
  const agents = await ctx.agents.list({ companyId: issue.companyId, limit: 500 });
  return agents.find((agent) => agent.urlKey === settings.clarifier)?.id;
}

/** Adds the clarify step to a flagged task: the record's clarify fields. */
async function clarify(
  ctx: ThinSpecApi,
  deps: ThinSpecDeps,
  settings: ActiveThinSpecSettings,
  issue: Issue,
  score: number,
): Promise<Pick<CheckRecord, "clarifyId" | "clarifyFailure">> {
  const name = issue.identifier ?? issue.id;
  const assigneeAgentId = await clarifierFor(ctx, settings, issue);
  const added =
    assigneeAgentId === undefined
      ? { failure: "no_clarifier" }
      : await addClarifyStep(ctx, deps, settings, issue.companyId, {
          parentId: issue.id,
          title: clarifyTitle({ identifier: name, title: issue.title }),
          description: clarifyDescription({ identifier: name }, score),
          assigneeAgentId,
          ...(typeof issue.projectId === "string" ? { projectId: issue.projectId } : {}),
          ...(typeof issue.goalId === "string" ? { goalId: issue.goalId } : {}),
        });
  // Not a failure: the writer picked the task up while Haiku was answering.
  if ("skipped" in added) {
    return { clarifyFailure: added.skipped };
  }
  if ("failure" in added) {
    await reportFailure(
      ctx,
      issue.companyId,
      `couldn't add the clarify step to ${name} (${added.failure}).`,
      added.failure,
    );
    return { clarifyFailure: added.failure };
  }
  return { clarifyId: added.clarifyId };
}

/** Keeps the record on the task and in the day's log, and counts it. */
async function logCheck(ctx: ThinSpecApi, companyId: string, record: CheckRecord) {
  await ctx.state.set(recordKey(record.taskId), record);
  const day = dayLogKey(companyId, record.checkedAt.slice(0, 10));
  const logged = ((await ctx.state.get(day)) as CheckRecord[] | null) ?? [];
  await ctx.state.set(day, [...logged, record]);
  const result = record.flagged ? "flagged" : "clear";
  ctx.logger.info(
    `Thin-spec check: ${record.identifier} ${result}, score ${record.score.toFixed(2)}.`,
    { companyId },
  );
  await writeMetrics(ctx, { "thin_spec.checked": 1 }, { companyId, result });
}

/** The month's spend, or undefined once it reached the limit. */
async function spendBeforeCall(ctx: ThinSpecApi, companyId: string, now: Date) {
  const stored = (await ctx.state.get(spendKey(companyId))) as MonthSpend | null;
  const spend = spendFor(stored, spendMonth(now));
  if (!overLimit(spend)) {
    return spend;
  }
  if (!spend.stopReported) {
    await reportFailure(
      ctx,
      companyId,
      `stopped for ${spend.month}, spend reached the $5 monthly limit.`,
      "spend_limit",
    );
    await ctx.state.set(spendKey(companyId), { ...spend, stopReported: true });
  }
  return undefined;
}

/** Checks one task, start to finish. */
async function handle(ctx: ThinSpecApi, deps: ThinSpecDeps, taskId: string, companyId: string) {
  const config = await companyConfig(ctx.config, companyId);
  const settings =
    config === undefined
      ? undefined
      : thinSpecOn(readThinSpecSettings(config), manifest.version, deps.model);
  const issue = settings === undefined ? null : await ctx.issues.get(taskId, companyId);
  const now = deps.now();
  if (settings === undefined || issue === null || !isNewCodingTask(issue, now)) {
    return;
  }
  // One check per task: a later edit or reassignment doesn't ask again.
  if ((await ctx.state.get(recordKey(taskId))) !== null) {
    return;
  }
  const spend = await spendBeforeCall(ctx, companyId, now);
  if (spend === undefined) {
    return;
  }
  const name = issue.identifier ?? issue.id;
  const asked = await askReading(
    ctx,
    deps,
    settings,
    companyId,
    taskText(issue.title, issue.description),
  );
  // No record after a failed call, so the task's next event asks again.
  if ("failure" in asked) {
    await reportFailure(
      ctx,
      companyId,
      `couldn't ask about ${name} (${asked.failure}).`,
      asked.failure,
    );
    return;
  }
  await ctx.state.set(spendKey(companyId), { ...spend, microUsd: spend.microUsd + asked.cost });
  await writeMetrics(ctx, { "thin_spec.spend_micro_usd": asked.cost }, { companyId });
  if (asked.reading === undefined) {
    await reportFailure(
      ctx,
      companyId,
      `the reading of ${name} wasn't the schema's JSON.`,
      "unreadable_answer",
    );
    return;
  }
  const score = thinSpecScore(settings.model, asked.reading);
  const flagged = score > flagThreshold;
  const base = { taskId, identifier: name, checkedAt: now.toISOString(), flagged, score };
  // Saved before the clarify step, so the task changes it causes never start a second check.
  await ctx.state.set(recordKey(taskId), base);
  const clarified = flagged ? await clarify(ctx, deps, settings, issue, score) : {};
  await logCheck(ctx, companyId, { ...base, ...clarified });
}

/** The thin-spec check for one plugin worker. */
export interface ThinSpecCheck {
  /** A task was created or changed: check it if an agent was just given a new code task. */
  onIssueEvent(event: PluginEvent): Promise<void>;
}

/**
 * The check. Events run one after another, so the month's spend and the day's
 * log are never written from stale totals, and the task changes the clarify
 * step causes are read after the task's record is saved.
 */
export function thinSpecCheck(ctx: ThinSpecApi, deps: ThinSpecDeps): ThinSpecCheck {
  let queue: Promise<void> = Promise.resolve();
  return {
    async onIssueEvent(event) {
      const payload = (event.payload ?? {}) as { id?: unknown };
      const taskId = event.entityId ?? (typeof payload.id === "string" ? payload.id : undefined);
      if (taskId === undefined) {
        return;
      }
      const work = async () => {
        try {
          await handle(ctx, deps, taskId, event.companyId);
        } catch (error) {
          ctx.logger.error(`Thin-spec check: couldn't handle a task event (${errorCode(error)}).`, {
            companyId: event.companyId,
          });
        }
      };
      queue = queue.then(work);
      await queue;
    },
  };
}
