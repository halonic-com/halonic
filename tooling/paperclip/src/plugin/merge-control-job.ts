import type {
  PluginAgentsClient,
  PluginConfigClient,
  PluginEntitiesClient,
  PluginHttpClient,
  PluginIssuesClient,
  PluginLogger,
  PluginSecretsClient,
} from "@paperclipai/plugin-sdk";
import { type ActResult, act, type MergeControlMode } from "../merge-control/act.ts";
import {
  type BudgetSettings,
  isLow,
  noCalls,
  type PassCalls,
  passBudget,
  readBudgetSettings,
  type StoredBudget,
} from "../merge-control/budget.ts";
import { decide } from "../merge-control/decide.ts";
import type { ReadOptions } from "../merge-control/facts.ts";
import { meteredWrites, type ReadFetch, ReadRefused } from "../merge-control/read-client.ts";
import { keepSent } from "../merge-control/retry.ts";
import {
  emptyShadowDay,
  nextShadowDay,
  type ObservedAction,
  recordShadow,
  type ShadowDay,
  shadowDiff,
  shadowDiffText,
} from "../merge-control/shadow.ts";
import { checkCopies } from "../merge-control/shadow-copies.ts";
import { type PassView, passView } from "../merge-control/shadow-reasons.ts";
import type { MergeSnapshot } from "../merge-control/snapshot.ts";
import {
  type Decision,
  defaultSettings,
  emptyMergeState,
  type MergeAction,
  type MergeSettings,
  type MergeState,
} from "../merge-control/state.ts";
import { type QueueWriteClient, queueWriteClient } from "../merge-control/write-client.ts";
import { paperclipCopies } from "./approval-copies.ts";
import { companyConfig, readSettings, requestTimeoutMs } from "./job.ts";
import { type MergeStateClient, type PassLock, passStateKey } from "./merge-control-lock.ts";
import { verdictReviewerIds } from "./review-verdict-declaration.ts";
import { withVerdictChecks } from "./verdict-shadow.ts";

/**
 * The `merge-control` job's pass for one company (ADR on HAL-17700): read
 * the facts, `decide`, then carry the actions out in `act` mode or only
 * compare them with the Merger's in `shadow` mode. The queue token is
 * resolved at each write and only in `act` mode; this is the only module
 * that builds the write client. The pass loads, decides and writes with the
 * company's pass lock held, and writes its state only through the lock's
 * client (HAL-17884).
 */

/** The part of the plugin context the pass uses, so tests can fake it; state comes from the lock. */
export interface MergeControlApi {
  readonly config: PluginConfigClient;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly http: PluginHttpClient;
  readonly issues: Pick<PluginIssuesClient, "createComment" | "get" | "listComments">;
  /** The approvals' Paperclip copies, for the shadow diff (HAL-19324). */
  readonly agents: Pick<PluginAgentsClient, "list">;
  /** The recorded verdicts, compared with the gate in shadow mode (HAL-19481). */
  readonly entities: Pick<PluginEntitiesClient, "upsert" | "list">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

/** What a pass reads: the snapshot for `decide`, and the Merger's writes for shadow mode. */
export interface MergeFacts {
  readonly snapshot: MergeSnapshot;
  readonly observed: readonly ObservedAction[];
  /** What the reads cost on the read token; none when the reader doesn't say. */
  readonly reads?: PassCalls;
}

/** Reads a company's facts (`merge-control-reader.ts`), lean when the read budget is low. */
export type MergeFactsReader = (
  companyId: string,
  now: Date,
  options?: ReadOptions,
) => Promise<MergeFacts>;

/** What a pass ends with: whether it degraded, and its GitHub budget line. */
export interface PassResult {
  readonly degraded: boolean;
  readonly summary: string;
}

/** A company's merge-control settings, as the board sets them. */
export interface MergeControlSettings {
  readonly mode: MergeControlMode;
  /** The secret with the queue credential, or undefined when none is set. */
  readonly queueToken: { readonly type: "secret_ref"; readonly secretId: string } | undefined;
  /** The task the daily shadow diff goes to (HAL-17700); empty: it is only logged. */
  readonly diffTask: string;
  /** The repository it acts on: the PR watcher's first. */
  readonly repo: string;
  /** The hourly GitHub call budgets of the read and write tokens (HAL-17913). */
  readonly budget: BudgetSettings;
  /** The rules' settings: today's, with the board's queue login from config (HAL-18506). */
  readonly rules: MergeSettings;
  /** The reviewers' agents the board named for `review_verdict`, by name (HAL-19481). */
  readonly verdictReviewers: Readonly<Record<string, string>>;
}

const modes: readonly MergeControlMode[] = ["off", "shadow", "act"];

/** The Merger's GitHub login, the board's queue login, from config; empty when unset or odd. */
export function queueLoginOf(config: Readonly<Record<string, unknown>>): string {
  const section = (config["mergeControl"] ?? {}) as Readonly<Record<string, unknown>>;
  const value = section["mergerLogin"];
  return typeof value === "string" && /^[A-Za-z0-9-]{1,39}$/.test(value.trim()) ? value.trim() : "";
}

/**
 * `defaultSettings` with the queue login added to the auto-label authors and to the
 * `fast-track` labellers, never written in code.
 */
export function rulesOf(config: Readonly<Record<string, unknown>>): MergeSettings {
  const login = queueLoginOf(config);
  return {
    ...defaultSettings,
    fastTrackLabellers: login === "" ? [] : [login],
    autoLabelAuthors: [
      ...defaultSettings.autoLabelAuthors,
      ...(login === "" || defaultSettings.autoLabelAuthors.includes(login) ? [] : [login]),
    ],
  };
}

/** Reads the settings; anything missing or odd is `off`, the safe default. */
export function readMergeControlSettings(
  config: Readonly<Record<string, unknown>>,
): MergeControlSettings {
  const section = (config["mergeControl"] ?? {}) as Readonly<Record<string, unknown>> & {
    readonly mode?: unknown;
    readonly diffTask?: unknown;
  };
  const token = config["mergeQueueToken"] as { type?: unknown; secretId?: unknown } | undefined;
  return {
    mode: modes.find((mode) => mode === section.mode) ?? "off",
    queueToken:
      token?.type === "secret_ref" && typeof token.secretId === "string"
        ? { type: "secret_ref", secretId: token.secretId }
        : undefined,
    diffTask: typeof section.diffTask === "string" ? section.diffTask.trim() : "",
    repo: readSettings(config).repos[0] ?? "halonic-com/halonic",
    budget: readBudgetSettings(section),
    verdictReviewers: verdictReviewerIds(config),
    rules: rulesOf(config),
  };
}

/** What the job keeps between passes, one entry per company. */
export interface StoredMergeControl {
  readonly version: 1;
  readonly state: MergeState;
  readonly shadow: ShadowDay | null;
  /** The hour's GitHub calls per token; missing before the first counted pass. */
  readonly budget?: StoredBudget;
}

/** The stored entry, or a fresh one; another version is refused, not guessed at. */
export async function loadMergeControl(
  state: MergeStateClient,
  companyId: string,
): Promise<StoredMergeControl> {
  const stored = (await state.get(passStateKey(companyId))) as StoredMergeControl | null;
  if (stored === null) {
    return { version: 1, state: emptyMergeState, shadow: null };
  }
  if (stored.version !== 1 || stored.state?.version !== 1) {
    throw new Error("Merge control: its stored state has another version.");
  }
  // A state saved before a field was added (`heldRuns`, HAL-18147) gets its empty value.
  return { ...stored, state: { ...emptyMergeState, ...stored.state } };
}

function costLine(action: MergeAction): string | undefined {
  if (
    (action.kind !== "enqueue" && action.kind !== "dequeue") ||
    action.cost.groupsCancelled === 0
  ) {
    return undefined;
  }
  return `cost: ${action.kind} #${action.number} cancels ${action.cost.groupsCancelled} groups, ${action.cost.runnerMinutes} runner-minutes`;
}

/**
 * Shadow mode's day: on the first pass of a new UTC day, posts the last
 * day's diff and starts a new one with the pull requests' tracks kept.
 * Returns undefined when the post failed, so the next pass tries again with
 * the old day kept.
 */
async function shadowDay(
  ctx: MergeControlApi,
  companyId: string,
  settings: MergeControlSettings,
  day: ShadowDay | null,
  now: Date,
): Promise<ShadowDay | undefined> {
  const today = emptyShadowDay(now);
  if (day === null || day.day === today.day) {
    return day ?? today;
  }
  const text = shadowDiffText(shadowDiff(day));
  if (settings.diffTask === "") {
    ctx.logger.info(text, { companyId });
    return nextShadowDay(day, now);
  }
  try {
    await ctx.issues.createComment(settings.diffTask, text, companyId);
    return nextShadowDay(day, now);
  } catch (error) {
    ctx.logger.error(`Merge control: couldn't post the shadow diff: ${(error as Error).message}`, {
      companyId,
    });
    return undefined;
  }
}

/**
 * The day with this pass's checks of the rule "needs a Paperclip copy with a
 * full-SHA match" (HAL-19324). A failed read is logged and the day kept as it
 * was, so the next pass checks again.
 */
async function withCopyChecks(
  ctx: MergeControlApi,
  companyId: string,
  day: ShadowDay,
  snapshot: MergeSnapshot,
  view: PassView,
  now: Date,
): Promise<ShadowDay> {
  try {
    const reader = paperclipCopies(ctx, companyId);
    return { ...day, copies: await checkCopies(snapshot, view, day.copies, reader, now) };
  } catch (error) {
    ctx.logger.error(
      `Merge control: couldn't read the approvals' Paperclip copies: ${(error as Error).message}`,
      { companyId },
    );
    return day;
  }
}

/**
 * The write client in act mode with a queue token, else none: shadow mode,
 * and act mode without a token, never write.
 */
function writeClient(
  ctx: MergeControlApi,
  companyId: string,
  settings: MergeControlSettings,
  fetch: ReadFetch,
): QueueWriteClient | undefined {
  const ref = settings.queueToken;
  if (settings.mode !== "act") {
    return undefined;
  }
  if (ref === undefined) {
    ctx.logger.error("Merge control: act mode without a queue token, nothing is written.", {
      companyId,
    });
    return undefined;
  }
  return queueWriteClient({
    fetch,
    // Resolved at each write, never kept (the SDK's secrets rule).
    token: () => ctx.secrets.resolve(ref, { companyId }),
    repos: [settings.repo],
  });
}

/** The pass's log, each jump's and dequeue's cost, and what happened to each action. */
function passLines(decision: Decision, results: readonly ActResult[]): string[] {
  return [
    ...decision.log.map((line) => `${line.rule}: ${line.text}`),
    ...decision.actions.flatMap((action) => costLine(action) ?? []),
    ...results.map(
      (result) =>
        `${result.action}: ${result.outcome}${result.error === undefined ? "" : ` (${result.error})`}`,
    ),
  ];
}

/**
 * One pass for one company, under its pass lock. Off: reads and writes
 * nothing and returns undefined.
 */
export async function mergeControlPass(
  ctx: MergeControlApi,
  lock: PassLock,
  companyId: string,
  now: Date,
  readFacts: MergeFactsReader,
): Promise<PassResult | undefined> {
  const config = await companyConfig(ctx.config, companyId);
  const settings = readMergeControlSettings(config ?? {});
  if (settings.mode === "off") {
    return undefined;
  }
  return await lock.run(companyId, (state) =>
    lockedPass(ctx, state, companyId, now, readFacts, settings),
  );
}

/**
 * A pass the budget stops before it reads: a degraded pass's wait isn't
 * over. Returns undefined when the pass may read.
 */
function waiting(stored: StoredMergeControl, now: Date): PassResult | undefined {
  const until = stored.budget?.skipUntil ?? null;
  if (until === null || Date.parse(until) <= now.getTime()) {
    return undefined;
  }
  return {
    degraded: true,
    summary: `GitHub budget: degraded, this pass waits until ${until.slice(11, 16)} UTC`,
  };
}

/** A pass whose read the reader refused: degraded, its budget kept, nothing decided. */
async function refusedPass(
  stateClient: MergeStateClient,
  companyId: string,
  stored: StoredMergeControl,
  refused: ReadRefused,
  settings: MergeControlSettings,
  now: Date,
): Promise<PassResult> {
  const reads = refused.calls ?? noCalls;
  const why = refused.message.replace(/\.$/, "");
  const budget = passBudget(
    stored.budget,
    { read: reads, write: noCalls },
    settings.budget,
    now,
    why,
  );
  await stateClient.set(passStateKey(companyId), { ...stored, budget: budget.stored });
  return { degraded: true, summary: budget.summary };
}

async function lockedPass(
  ctx: MergeControlApi,
  stateClient: MergeStateClient,
  companyId: string,
  now: Date,
  readFacts: MergeFactsReader,
  settings: MergeControlSettings,
): Promise<PassResult> {
  const stored = await loadMergeControl(stateClient, companyId);
  const info = (line: string) => ctx.logger.info(`Merge control: ${line}`, { companyId });
  const wait = waiting(stored, now);
  if (wait !== undefined) {
    info(wait.summary);
    return wait;
  }
  const lean = isLow(stored.budget?.read, settings.budget.read, now);
  let facts: MergeFacts;
  try {
    facts = await readFacts(companyId, now, { lean });
  } catch (error) {
    if (!(error instanceof ReadRefused)) {
      throw error;
    }
    const refused = await refusedPass(stateClient, companyId, stored, error, settings, now);
    info(refused.summary);
    return refused;
  }
  const decision = decide(facts.snapshot, stored.state, settings.rules, now);
  const writes = meteredWrites((url, init) =>
    ctx.http.fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }),
  );
  const client = writeClient(ctx, companyId, settings, writes.fetch);
  const results = await act(decision.actions, { repo: settings.repo, client });
  const calls = { read: facts.reads ?? noCalls, write: writes.calls() };
  const budget = passBudget(stored.budget, calls, settings.budget, now);
  for (const line of [...passLines(decision, results), budget.summary]) {
    info(line);
  }
  let shadow = stored.shadow;
  if (settings.mode === "shadow") {
    const day = await shadowDay(ctx, companyId, settings, stored.shadow, now);
    if (day !== undefined) {
      const verdictShadow = {
        repo: settings.repo,
        teamLogin: settings.rules.teamLogin,
        reviewerIds: settings.verdictReviewers,
      };
      const view = passView(facts.snapshot, decision, settings.rules);
      shadow = recordShadow(day, decision.actions, facts.observed, now, view);
      shadow = await withCopyChecks(ctx, companyId, shadow, facts.snapshot, view, now);
      shadow = await withVerdictChecks(ctx, companyId, shadow, facts.snapshot, verdictShadow, now);
    }
  }
  const state = keepSent(stored.state, decision.state, decision.actions, results);
  await stateClient.set(passStateKey(companyId), {
    version: 1,
    state,
    shadow,
    budget: budget.stored,
  });
  return { degraded: budget.degraded, summary: budget.summary };
}
