import { createHash } from "node:crypto";
import type {
  PluginConfigClient,
  PluginEvent,
  PluginHttpClient,
  PluginIssuesClient,
  PluginLogger,
  PluginSecretsClient,
} from "@paperclipai/plugin-sdk";
import { labelsFor, type TaggerAnswer } from "../difficulty-tagger/answer.ts";
import {
  handTagged,
  labelsAfter,
  shouldTag,
  type TaggerRecord,
} from "../difficulty-tagger/decide.ts";
import { taggerInput } from "../difficulty-tagger/prompt.ts";
import {
  type DifficultyTaggerSettings,
  readTaggerSettings,
  taggerWritesOn,
} from "../difficulty-tagger/settings.ts";
import type { StateApi } from "../snapshot/store.ts";
import { errorCode } from "./board-check-api.ts";
import { askTagger, companyLabelIds, type Fetch } from "./difficulty-tagger-calls.ts";
import { setTaskLabels } from "./host.ts";
import { companyConfig } from "./job.ts";
import { manifest } from "./manifest.ts";
import { type MetricsApi, writeMetrics } from "./metrics.ts";
import { perTaskQueue, taskIdOf } from "./task-events.ts";

/**
 * The difficulty tagger (HAL-16902, HAL-16866 step 3): on a task's
 * `issue.created`, and on `issue.updated` when its title or description
 * changed, it asks Haiku with the board's prompt and labels the task `D1`–`D4`
 * and `opus-only` (code work only). The task effort handler then sets the
 * effort from those labels. A difficulty or `opus-only` label someone else set
 * always wins. Its log and metrics name task identifiers, labels and kinds of
 * work, never task text or the model's text.
 */

/** The part of the plugin context the tagger uses, so tests can fake it. */
export interface TaggerApi extends MetricsApi, StateApi {
  readonly issues: Pick<PluginIssuesClient, "get" | "update">;
  /** The host's guarded `fetch`, for the request to Anthropic. */
  readonly http: Pick<PluginHttpClient, "fetch">;
  readonly config: PluginConfigClient;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly logger: Pick<PluginLogger, "info" | "warn" | "error">;
}

/** Node's own `fetch` for Paperclip's API, a private host the host's guard may refuse. Tests replace it. */
export interface TaggerDeps {
  readonly fetch: Fetch;
}

type Issue = NonNullable<Awaited<ReturnType<TaggerApi["issues"]["get"]>>>;

/** Tasks the tagger leaves alone: their work is over. */
const closedStatuses: ReadonlySet<string> = new Set(["done", "cancelled"]);

function recordKey(taskId: string) {
  return {
    scopeKind: "issue",
    scopeId: taskId,
    namespace: "difficulty",
    stateKey: "record",
  } as const;
}

function labelNames(issue: Issue): string[] {
  return (issue.labels ?? []).map((label) => label.name);
}

/** A hash of exactly the text the tagger reads, so an unrelated change doesn't ask again. */
function textHash(issue: Issue): string {
  return createHash("sha256").update(taggerInput(issue.title, issue.description)).digest("hex");
}

/** The labels as a log line shows them: label names, or `none (<kind>)` for other work. */
function shown(labels: readonly string[], answer: TaggerAnswer): string {
  return labels.length > 0 ? labels.join(" ") : `none (${answer.kind})`;
}

/** The task's label ids for `names`, or a failure code when one isn't a company label. */
async function labelIds(
  ctx: TaggerApi,
  deps: TaggerDeps,
  settings: DifficultyTaggerSettings,
  issue: Issue,
  names: readonly string[],
): Promise<{ ids: string[] } | { failure: string }> {
  if (settings.apiUrl === undefined || settings.apiKey === undefined) {
    return { failure: "not_configured" };
  }
  // Read at run time and never logged or kept (the SDK's secrets rule).
  const key = await ctx.secrets.resolve(settings.apiKey, { companyId: issue.companyId });
  const company = await companyLabelIds(deps.fetch, settings.apiUrl, key, issue.companyId);
  if ("failure" in company) {
    return company;
  }
  const onTask = new Map((issue.labels ?? []).map((label) => [label.name, label.id]));
  const ids: string[] = [];
  for (const name of names) {
    const id = onTask.get(name) ?? company.ids.get(name.trim().toLowerCase());
    if (id === undefined) {
      return { failure: "missing_label" };
    }
    ids.push(id);
  }
  return { ids };
}

/** Puts the answer's labels on the task. Returns a failure code, or undefined when it went through. */
async function writeLabels(
  ctx: TaggerApi,
  deps: TaggerDeps,
  settings: DifficultyTaggerSettings,
  task: Issue,
  labels: readonly string[],
  record: TaggerRecord | undefined,
): Promise<string | undefined> {
  // Read again: someone may have labelled it by hand while the model answered.
  const issue = await ctx.issues.get(task.id, task.companyId);
  if (issue === null) {
    return "gone";
  }
  if (handTagged(labelNames(issue), record)) {
    return "hand_tagged";
  }
  const result = await labelIds(
    ctx,
    deps,
    settings,
    issue,
    labelsAfter(labelNames(issue), labels, record),
  );
  if ("failure" in result) {
    return result.failure;
  }
  try {
    await setTaskLabels(ctx.issues, issue.id, result.ids, issue.companyId);
    return undefined;
  } catch (error) {
    return errorCode(error);
  }
}

/** Asks the model about the task, or logs why it couldn't. */
async function ask(
  ctx: TaggerApi,
  settings: DifficultyTaggerSettings,
  issue: Issue,
  anthropicKey: NonNullable<DifficultyTaggerSettings["anthropicKey"]>,
): Promise<TaggerAnswer | undefined> {
  const key = await ctx.secrets.resolve(anthropicKey, { companyId: issue.companyId });
  const input = taggerInput(issue.title, issue.description);
  const asked = await askTagger(ctx.http.fetch, key, settings.model, input);
  if ("answer" in asked) {
    return asked.answer;
  }
  const name = issue.identifier ?? issue.id;
  ctx.logger.error(`Difficulty tagger: couldn't tag ${name} (${asked.failure}).`, {
    companyId: issue.companyId,
  });
  await writeMetrics(
    ctx,
    { "difficulty_tagger.failed": 1 },
    { companyId: issue.companyId, reason: asked.failure },
  );
  return undefined;
}

/** Handles one event for one task, start to finish. */
async function handle(
  ctx: TaggerApi,
  deps: TaggerDeps,
  event: PluginEvent,
  taskId: string,
  settings: DifficultyTaggerSettings,
): Promise<void> {
  const issue = await ctx.issues.get(taskId, event.companyId);
  if (settings.anthropicKey === undefined || issue === null || closedStatuses.has(issue.status)) {
    return;
  }
  const record = ((await ctx.state.get(recordKey(taskId))) as TaggerRecord | null) ?? undefined;
  const hash = textHash(issue);
  const writesOn = taggerWritesOn(settings, manifest.version);
  if (!shouldTag(labelNames(issue), hash, record, writesOn)) {
    return;
  }
  const answer = await ask(ctx, settings, issue, settings.anthropicKey);
  if (answer === undefined) {
    // No record: the next change of the task asks again.
    return;
  }
  const labels = labelsFor(answer);
  const name = issue.identifier ?? issue.id;
  const meta = { companyId: issue.companyId };
  const saved: TaggerRecord = {
    textHash: hash,
    labels: labels.map((label) => label.toLowerCase()),
    written: writesOn,
  };
  if (!writesOn) {
    ctx.logger.info(
      `Difficulty tagger: would label ${name} ${shown(labels, answer)} (switch off).`,
      meta,
    );
    await writeMetrics(ctx, { "difficulty_tagger.logged": 1 }, { ...meta, kind: answer.kind });
    await ctx.state.set(recordKey(taskId), saved);
    return;
  }
  const failure = await writeLabels(ctx, deps, settings, issue, labels, record);
  if (failure === "hand_tagged") {
    return;
  }
  if (failure !== undefined) {
    ctx.logger.error(`Difficulty tagger: couldn't label ${name} (${failure}).`, meta);
    await writeMetrics(ctx, { "difficulty_tagger.failed": 1 }, { ...meta, reason: failure });
    return;
  }
  ctx.logger.info(`Difficulty tagger: labelled ${name} ${shown(labels, answer)}.`, meta);
  await writeMetrics(ctx, { "difficulty_tagger.set": 1 }, { ...meta, kind: answer.kind });
  await ctx.state.set(recordKey(taskId), saved);
}

/** The difficulty tagger for one plugin worker. */
export interface DifficultyTagger {
  /** A task was created or changed: tag it when its text is new to the tagger and nobody tagged it by hand. */
  onIssueEvent(event: PluginEvent): Promise<void>;
}

/** The tagger. Events for one task run one after another, so its own label change reads its saved record. */
export function difficultyTagger(ctx: TaggerApi, deps: TaggerDeps): DifficultyTagger {
  const queue = perTaskQueue();
  return {
    async onIssueEvent(event) {
      const taskId = taskIdOf(event);
      if (taskId === undefined) {
        return;
      }
      await queue(taskId, async () => {
        try {
          const config = await companyConfig(ctx.config, event.companyId);
          if (config !== undefined) {
            await handle(ctx, deps, event, taskId, readTaggerSettings(config));
          }
        } catch (error) {
          ctx.logger.error(
            `Difficulty tagger: couldn't handle a task event (${errorCode(error)}).`,
            {
              companyId: event.companyId,
            },
          );
        }
      });
    },
  };
}
