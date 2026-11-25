import type {
  PluginConfigClient,
  PluginHttpClient,
  PluginIssuesClient,
  PluginLogger,
  PluginSecretsClient,
} from "@paperclipai/plugin-sdk";
import { type ActResult, act, type MergeControlMode } from "../merge-control/act.ts";
import { decide } from "../merge-control/decide.ts";
import {
  emptyShadowDay,
  type ObservedAction,
  recordShadow,
  type ShadowDay,
  shadowDiff,
  shadowDiffText,
} from "../merge-control/shadow.ts";
import type { MergeSnapshot } from "../merge-control/snapshot.ts";
import {
  type Decision,
  defaultSettings,
  emptyMergeState,
  type MergeAction,
  type MergeState,
} from "../merge-control/state.ts";
import { type QueueWriteClient, queueWriteClient } from "../merge-control/write-client.ts";
import type { StateApi } from "../snapshot/store.ts";
import { companyConfig, readSettings, requestTimeoutMs } from "./job.ts";

/**
 * The `merge-control` job's pass for one company (ADR on HAL-17700): read
 * the facts, `decide`, then carry the actions out in `act` mode or only
 * compare them with the Merger's in `shadow` mode. The queue token is
 * resolved at each write and only in `act` mode; this is the only module
 * that builds the write client.
 */

/** The part of the plugin context the pass uses, so tests can fake it. */
export interface MergeControlApi extends StateApi {
  readonly config: PluginConfigClient;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly http: PluginHttpClient;
  readonly issues: Pick<PluginIssuesClient, "createComment">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

/** What a pass reads: the snapshot for `decide`, and the Merger's writes for shadow mode. */
export interface MergeFacts {
  readonly snapshot: MergeSnapshot;
  readonly observed: readonly ObservedAction[];
}

/** Reads a company's facts; `facts.ts` in the next pull request. */
export type MergeFactsReader = (companyId: string, now: Date) => Promise<MergeFacts>;

/** A company's merge-control settings, as the board sets them. */
export interface MergeControlSettings {
  readonly mode: MergeControlMode;
  /** The secret with the queue credential, or undefined when none is set. */
  readonly queueToken: { readonly type: "secret_ref"; readonly secretId: string } | undefined;
  /** The task the daily shadow diff goes to (HAL-17700); empty: it is only logged. */
  readonly diffTask: string;
  /** The repository it acts on: the PR watcher's first. */
  readonly repo: string;
}

const modes: readonly MergeControlMode[] = ["off", "shadow", "act"];

/** Reads the settings; anything missing or odd is `off`, the safe default. */
export function readMergeControlSettings(
  config: Readonly<Record<string, unknown>>,
): MergeControlSettings {
  const section = (config["mergeControl"] ?? {}) as { mode?: unknown; diffTask?: unknown };
  const token = config["mergeQueueToken"] as { type?: unknown; secretId?: unknown } | undefined;
  return {
    mode: modes.find((mode) => mode === section.mode) ?? "off",
    queueToken:
      token?.type === "secret_ref" && typeof token.secretId === "string"
        ? { type: "secret_ref", secretId: token.secretId }
        : undefined,
    diffTask: typeof section.diffTask === "string" ? section.diffTask.trim() : "",
    repo: readSettings(config).repos[0] ?? "halonic-com/halonic",
  };
}

/** What the job keeps between passes, one entry per company. */
export interface StoredMergeControl {
  readonly version: 1;
  readonly state: MergeState;
  readonly shadow: ShadowDay | null;
}

function key(companyId: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "merge-control",
    stateKey: "pass",
  } as const;
}

/** The stored entry, or a fresh one; another version is refused, not guessed at. */
export async function loadMergeControl(
  ctx: StateApi,
  companyId: string,
): Promise<StoredMergeControl> {
  const stored = (await ctx.state.get(key(companyId))) as StoredMergeControl | null;
  if (stored === null) {
    return { version: 1, state: emptyMergeState, shadow: null };
  }
  if (stored.version !== 1 || stored.state?.version !== 1) {
    throw new Error("Merge control: its stored state has another version.");
  }
  return stored;
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
 * day's diff and starts a new one. Returns undefined when the post failed,
 * so the next pass tries again with the old day kept.
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
    return today;
  }
  try {
    await ctx.issues.createComment(settings.diffTask, text, companyId);
    return today;
  } catch (error) {
    ctx.logger.error(`Merge control: couldn't post the shadow diff: ${(error as Error).message}`, {
      companyId,
    });
    return undefined;
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
    fetch: (url, init) =>
      ctx.http.fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }),
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

/** One pass for one company. Off: reads and writes nothing. */
export async function mergeControlPass(
  ctx: MergeControlApi,
  companyId: string,
  now: Date,
  readFacts: MergeFactsReader,
): Promise<void> {
  const config = await companyConfig(ctx.config, companyId);
  const settings = readMergeControlSettings(config ?? {});
  if (settings.mode === "off") {
    return;
  }
  const stored = await loadMergeControl(ctx, companyId);
  const facts = await readFacts(companyId, now);
  const decision = decide(facts.snapshot, stored.state, defaultSettings, now);
  const client = writeClient(ctx, companyId, settings);
  const results = await act(decision.actions, { repo: settings.repo, client });
  for (const line of passLines(decision, results)) {
    ctx.logger.info(`Merge control: ${line}`, { companyId });
  }
  let shadow = stored.shadow;
  if (settings.mode === "shadow") {
    const day = await shadowDay(ctx, companyId, settings, stored.shadow, now);
    if (day !== undefined) {
      shadow = recordShadow(day, decision.actions, facts.observed, now);
    }
  }
  await ctx.state.set(key(companyId), { version: 1, state: decision.state, shadow });
}
