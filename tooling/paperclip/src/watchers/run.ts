import type { PluginLogger, PluginStateClient } from "@paperclipai/plugin-sdk";
import type { HostApi } from "../plugin/host.ts";
import type { FoundPulls } from "../pr-watcher/discover.ts";
import type { TaskRow } from "../pr-watcher/paperclip.ts";
import type { Snapshot } from "../snapshot/shape.ts";
import {
  emptyReviewerWake,
  type Reviewer,
  type ReviewerWakeState,
  reviewerWakePass,
  reviewerWakeText,
} from "./reviewer-wake.ts";
import { emptyUnhandled, type UnhandledState, unhandledPass, unhandledText } from "./unhandled.ts";

/**
 * The merge control watchers' run inside each `pr-watch` pass (HAL-17938):
 * the reviewer wake and the 6-hour escalation. Both read the pass's snapshot
 * and plugin state and send no GitHub request; their only writes are a
 * comment and a wake-up on the chat tasks their settings name, and only
 * once the board turns their dry run off.
 */

/** The watchers' settings, from the plugin config. */
export interface WatchersSettings {
  /** Only log what they would write. On unless the board turns it off. */
  readonly dryRun: boolean;
  /** The task each reviewer is woken on (Chief, HAL-17940: Liam's chat HAL-45, Julian's HAL-44), by id; empty: no write. */
  readonly wakeTasks: Readonly<Record<Reviewer, string>>;
  /** The task UNHANDLED problems go to (Chief's chat, HAL-10), by id; empty: no write. */
  readonly unhandledTask: string;
}

function text(config: Readonly<Record<string, unknown>>, name: string): string {
  const value = config[name];
  return typeof value === "string" ? value.trim() : "";
}

/** Reads the watchers' settings; a missing value means dry run and no task. */
export function readWatchersSettings(config: Readonly<Record<string, unknown>>): WatchersSettings {
  return {
    dryRun: config["mergeWatchersDryRun"] !== false,
    wakeTasks: { Liam: text(config, "liamWakeTask"), Julian: text(config, "julianWakeTask") },
    unhandledTask: text(config, "unhandledTask"),
  };
}

/** The part of the plugin context the watchers use. */
export interface WatchersApi extends Pick<HostApi, "issues"> {
  readonly state: Pick<PluginStateClient, "get" | "set">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

function stateKey(companyId: string, name: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "merge-watchers",
    stateKey: name,
  } as const;
}

async function load<T extends { version: 1 }>(
  ctx: WatchersApi,
  companyId: string,
  name: string,
  empty: T,
): Promise<T> {
  const stored = (await ctx.state.get(stateKey(companyId, name))) as { version?: unknown } | null;
  return stored?.version === 1 ? (stored as T) : empty;
}

/**
 * Comments on the task and wakes its holder, or only logs in a dry run or
 * without a task set. `key` makes a repeated wake-up a no-op.
 */
async function post(
  ctx: WatchersApi,
  companyId: string,
  options: { taskId: string; body: string; key: string; dryRun: boolean; what: string },
): Promise<void> {
  const { taskId, body, key, dryRun, what } = options;
  if (dryRun || taskId === "") {
    const why = dryRun ? "dry run" : "no task set";
    ctx.logger.info(`${what} (${why}): ${body}`, { companyId });
    return;
  }
  await ctx.issues.createComment(taskId, body, companyId);
  // A plugin's comment wakes nobody, so the wake-up is its own call.
  await ctx.issues.requestWakeup(taskId, companyId, {
    reason: "merge_watchers",
    idempotencyKey: `merge-watchers ${taskId} ${key}`,
  });
}

/**
 * Tasks blocked with a blocker set that have a pull request: a known wait,
 * which the 6-hour escalation leaves alone (Chief, HAL-17940).
 */
async function waitingTasks(
  ctx: WatchersApi,
  companyId: string,
  tasks: readonly TaskRow[],
  found: FoundPulls,
): Promise<Set<string>> {
  const waiting = new Set<string>();
  for (const task of tasks) {
    if (task.blocked === true && (found.get(task.identifier) ?? []).length > 0) {
      const relations = await ctx.issues.relations.get(task.id, companyId);
      if (relations.blockedBy.length > 0) {
        waiting.add(task.identifier);
      }
    }
  }
  return waiting;
}

/** What a run needs from the pass. */
export interface WatchersInput {
  readonly companyId: string;
  readonly snapshot: Snapshot;
  /** The repository the reviewer wake watches (`halonic`, the watcher's first). */
  readonly repo: string;
  readonly settings: WatchersSettings;
  readonly tasks: readonly TaskRow[];
  readonly found: FoundPulls;
  readonly now: Date;
}

/** Runs both watchers once. A failure in one is logged and leaves the other alone. */
export async function runMergeWatchers(ctx: WatchersApi, input: WatchersInput): Promise<void> {
  const { companyId, snapshot, settings, now } = input;
  try {
    const before = await load<ReviewerWakeState>(
      ctx,
      companyId,
      "reviewer-wake",
      emptyReviewerWake,
    );
    const pass = reviewerWakePass(snapshot, input.repo, before, now);
    for (const wake of pass.wakes) {
      const key = wake.pulls.map((pull) => `${pull.number}@${pull.head.slice(0, 7)}`).join(",");
      await post(ctx, companyId, {
        taskId: settings.wakeTasks[wake.reviewer],
        body: reviewerWakeText(wake),
        key,
        dryRun: settings.dryRun,
        what: `Reviewer wake for ${wake.reviewer}`,
      });
    }
    await ctx.state.set(stateKey(companyId, "reviewer-wake"), pass.state);
  } catch (error) {
    ctx.logger.error(`Reviewer wake: couldn't run: ${(error as Error).message}`, { companyId });
  }
  try {
    const before = await load<UnhandledState>(ctx, companyId, "unhandled", emptyUnhandled);
    const waiting = await waitingTasks(ctx, companyId, input.tasks, input.found);
    const pass = unhandledPass(snapshot, before, waiting, now);
    if (pass.reports.length > 0) {
      await post(ctx, companyId, {
        taskId: settings.unhandledTask,
        body: unhandledText(pass.reports, now),
        key: now.toISOString(),
        dryRun: settings.dryRun,
        what: "UNHANDLED report",
      });
    }
    await ctx.state.set(stateKey(companyId, "unhandled"), pass.state);
  } catch (error) {
    ctx.logger.error(`UNHANDLED report: couldn't run: ${(error as Error).message}`, { companyId });
  }
}
