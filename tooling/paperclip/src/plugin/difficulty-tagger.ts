import { createHash } from "node:crypto";
import type { PluginEvent } from "@paperclipai/plugin-sdk";
import {
  isDifficultyLabel,
  labelsFor,
  nextLabelIds,
  sameLabels,
  taggerOwnsLabels,
} from "../difficulty-tagger/labels.ts";
import { type TaggerAnswer, taggerInput } from "../difficulty-tagger/prompt.ts";
import {
  type ActiveTaggerSettings,
  readTaggerSettings,
  taggerOn,
} from "../difficulty-tagger/settings.ts";
import { type MonthSpend, overLimit, spendFor, spendMonth } from "../difficulty-tagger/spend.ts";
import { errorCode } from "./board-check-api.ts";
import {
  askTagger,
  companyLabels,
  type TaggerApi,
  type TaggerDeps,
} from "./difficulty-tagger-calls.ts";
import { setTaskLabels } from "./host.ts";
import { companyConfig } from "./job.ts";
import { manifest } from "./manifest.ts";
import { writeMetrics } from "./metrics.ts";

/**
 * The difficulty tagger (HAL-16901): when a task is created, or its title or
 * description changes, it asks Haiku for the task's kind and difficulty and
 * writes the `D1`–`D4` and `opus-only` labels the task effort handler reads.
 * Its log and metrics name task identifiers and labels, never task text or
 * the key.
 */

type Issue = NonNullable<Awaited<ReturnType<TaggerApi["issues"]["get"]>>>;

/** Logs a failure and counts it with its reason. */
async function reportFailure(ctx: TaggerApi, companyId: string, line: string, reason: string) {
  ctx.logger.error(`Difficulty tagger: ${line}`, { companyId });
  await writeMetrics(ctx, { "difficulty_tagger.failed": 1 }, { companyId, reason });
}

/** What the tagger keeps per task: which text it last tagged and which labels it wrote. */
interface TagRecord {
  /** A hash of what it read, so a change that leaves the title and description alone costs no call. */
  readonly inputHash: string;
  readonly written: readonly string[];
}

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

function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Reports the stop on the plugin page once a month, as an error line and a metric. */
async function reportStop(ctx: TaggerApi, companyId: string, spend: MonthSpend): Promise<void> {
  if (spend.stopReported) {
    return;
  }
  const dollars = (spend.microUsd / 1_000_000).toFixed(2);
  ctx.logger.error(
    `Difficulty tagger: stopped for ${spend.month}, spend $${dollars} reached the $5 monthly limit. New tasks get no labels until next month; Chief or the task's creator labels them by hand.`,
    { companyId },
  );
  await writeMetrics(ctx, { "difficulty_tagger.stopped": 1 }, { companyId, month: spend.month });
  await ctx.state.set(spendKey(companyId), { ...spend, stopReported: true });
}

/**
 * Writes the wanted difficulty labels, keeping every other label. Returns
 * whether it did. It reads the task again first, because a person may have
 * set a label while Haiku answered, and theirs wins.
 */
async function writeLabels(
  ctx: TaggerApi,
  deps: TaggerDeps,
  settings: ActiveTaggerSettings,
  task: {
    readonly id: string;
    readonly companyId: string;
    readonly written: readonly string[] | undefined;
  },
  wanted: readonly string[],
): Promise<boolean> {
  const issue = await ctx.issues.get(task.id, task.companyId);
  const labelNames = (issue?.labels ?? []).map((label) => label.name);
  if (issue === null || !taggerOwnsLabels(labelNames, task.written)) {
    return false;
  }
  if (sameLabels(wanted, labelNames.filter(isDifficultyLabel))) {
    return true;
  }
  const name = issue.identifier ?? issue.id;
  const meta = { companyId: issue.companyId };
  const next = nextLabelIds(
    issue.labels ?? [],
    wanted,
    await companyLabels(ctx, deps, settings, issue.companyId),
  );
  if ("missing" in next) {
    const line = `couldn't label ${name}, no company label ${next.missing.join(", ")}.`;
    await reportFailure(ctx, issue.companyId, line, "missing_label");
    return false;
  }
  await setTaskLabels(ctx.issues, issue.id, next.ids, issue.companyId);
  ctx.logger.info(`Difficulty tagger: labelled ${name} ${wanted.join(" ") || "(none)"}.`, meta);
  await writeMetrics(
    ctx,
    { "difficulty_tagger.labelled": 1 },
    { ...meta, labels: wanted.join(" ") || "none" },
  );
  return true;
}

/**
 * The month's spend, or undefined once it passed the limit (the stop is
 * reported then, once a month).
 */
async function spendBeforeCall(ctx: TaggerApi, deps: TaggerDeps, companyId: string) {
  const stored = (await ctx.state.get(spendKey(companyId))) as MonthSpend | null;
  const spend = spendFor(stored, spendMonth(deps.now()));
  if (!overLimit(spend)) {
    return spend;
  }
  await reportStop(ctx, companyId, spend);
  return undefined;
}

/** Asks Haiku and counts what it cost. Returns the readable answer, or undefined after reporting why not. */
async function askAndCount(
  ctx: TaggerApi,
  deps: TaggerDeps,
  settings: ActiveTaggerSettings,
  issue: Issue,
  input: string,
): Promise<TaggerAnswer | undefined> {
  const companyId = issue.companyId;
  const spend = await spendBeforeCall(ctx, deps, companyId);
  if (spend === undefined) {
    return undefined;
  }
  const asked = await askTagger(ctx, deps, settings, companyId, input);
  const name = issue.identifier ?? issue.id;
  if ("failure" in asked) {
    await reportFailure(
      ctx,
      companyId,
      `couldn't ask about ${name} (${asked.failure}).`,
      asked.failure,
    );
    return undefined;
  }
  await ctx.state.set(spendKey(companyId), { ...spend, microUsd: spend.microUsd + asked.cost });
  await writeMetrics(ctx, { "difficulty_tagger.spend_micro_usd": asked.cost }, { companyId });
  if (asked.answer === undefined) {
    const line = `the answer about ${name} wasn't the JSON the prompt asks for.`;
    await reportFailure(ctx, companyId, line, "unreadable_answer");
  }
  return asked.answer;
}

/** The tagger's settings when the board turned it on for this version, or undefined. */
async function activeSettings(ctx: TaggerApi, companyId: string) {
  const config = await companyConfig(ctx.config, companyId);
  return config === undefined ? undefined : taggerOn(readTaggerSettings(config), manifest.version);
}

/** Tags one task, start to finish. */
async function handle(
  ctx: TaggerApi,
  deps: TaggerDeps,
  taskId: string,
  companyId: string,
): Promise<void> {
  const settings = await activeSettings(ctx, companyId);
  const issue = settings === undefined ? null : await ctx.issues.get(taskId, companyId);
  if (settings === undefined || issue === null) {
    return;
  }
  const record = (await ctx.state.get(recordKey(taskId))) as TagRecord | null;
  const labelNames = (issue.labels ?? []).map((label) => label.name);
  // A person's or Chief's labels win: no call, no write.
  if (!taggerOwnsLabels(labelNames, record?.written)) {
    return;
  }
  const input = taggerInput(issue.title, issue.description);
  const inputHash = hashOf(input);
  if (record?.inputHash === inputHash) {
    return;
  }
  const answer = await askAndCount(ctx, deps, settings, issue, input);
  // Unreadable: keep the labels and don't ask again until the text changes. A refused call asks again.
  const wanted = answer === undefined ? undefined : labelsFor(answer);
  if (wanted !== undefined) {
    const task = { id: issue.id, companyId: issue.companyId, written: record?.written };
    if (!(await writeLabels(ctx, deps, settings, task, wanted))) {
      return;
    }
  }
  await ctx.state.set(recordKey(taskId), { inputHash, written: wanted ?? record?.written ?? [] });
}

/** The difficulty tagger for one plugin worker. */
export interface DifficultyTagger {
  /** A task was created or changed: label it when its title or description is new to the tagger. */
  onIssueEvent(event: PluginEvent): Promise<void>;
}

/**
 * The tagger. Events run one after another across all tasks, so the month's
 * spend is never counted from a stale total, and the `issue.updated` its own
 * label write causes is read after its record is saved.
 */
export function difficultyTagger(ctx: TaggerApi, deps: TaggerDeps): DifficultyTagger {
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
          ctx.logger.error(
            `Difficulty tagger: couldn't handle a task event (${errorCode(error)}).`,
            {
              companyId: event.companyId,
            },
          );
        }
      };
      queue = queue.then(work);
      await queue;
    },
  };
}
