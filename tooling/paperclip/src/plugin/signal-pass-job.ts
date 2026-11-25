import type { PluginLogger, PluginStateClient, ScopeKey } from "@paperclipai/plugin-sdk";
import type { TaskObserver } from "../pr-watcher/watch.ts";
import { loadSignals } from "../signals/load.ts";
import {
  dryRunSignalExecutors,
  emptySignalState,
  type SignalState,
  signalPass,
} from "../signals/pass.ts";
import { ruleInputs, watchedTask } from "../signals/pr-watcher-input.ts";
import { decide, type PrWatcherSettings, type WatchedTask } from "../signals/rules/pr-watcher.ts";
import type { WatcherPass } from "../workflow-host/pr-watcher-lifecycle-pass.ts";

/**
 * The `pr-watcher` signal rule inside each `pr-watch` pass (HAL-18197), in
 * dry run beside today's watcher: from the same facts and memory the
 * watcher decided on, it works out the done and wake actions, logs what it
 * would do next to the watcher's lines, and writes nothing to Paperclip or
 * GitHub. Today's watcher keeps doing the writes. A failure is logged and
 * leaves the watcher's own work alone.
 */

/** Collects what the watcher read about each task, as the rule reads it. */
export interface WatcherRecorder {
  readonly observe: TaskObserver;
  /** The tasks heard so far, in the watcher's order. */
  tasks(): readonly WatchedTask[];
}

/** A recorder for one company's pass. */
export function watcherRecorder(): WatcherRecorder {
  const tasks: WatchedTask[] = [];
  return {
    observe: (task, ownerId, pulls, memory) => {
      tasks.push(watchedTask(task, ownerId, pulls, memory));
    },
    tasks: () => tasks,
  };
}

/** The part of the plugin context the pass uses. */
export interface SignalJobApi {
  readonly state: Pick<PluginStateClient, "get" | "set">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

/**
 * Where the dry pass keeps its `SignalState`. Its own key, apart from a
 * live pass's: a key the dry executors "carried out" was never written, so
 * a live pass must not take it as done.
 */
function stateKey(companyId: string): ScopeKey {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "signals",
    stateKey: "pr-watcher-dry-run",
  };
}

async function loadState(ctx: SignalJobApi, companyId: string): Promise<SignalState> {
  const stored = (await ctx.state.get(stateKey(companyId))) as SignalState | null;
  return stored?.version === 1 ? stored : emptySignalState;
}

/** What the pass logs as one line each, under the company. */
function logAll(ctx: SignalJobApi, companyId: string, lines: readonly string[]): void {
  for (const line of lines) {
    ctx.logger.info(line, { companyId });
  }
}

/**
 * One dry pass of the `pr-watcher` signal on the tasks the watcher read.
 * Returns the tasks and actions for the lifecycle, or undefined when the
 * rule is off or the pass failed.
 */
export async function prWatcherSignalPass(
  ctx: SignalJobApi,
  companyId: string,
  tasks: readonly WatchedTask[],
  now: Date,
): Promise<WatcherPass | undefined> {
  try {
    // The plugin reads no workspace snapshot yet, so the built-in signals run. Once it does,
    // `readSnapshot` refuses a snapshot with a broken signal whole before it gets here (#5966 review).
    const loaded = loadSignals(undefined);
    logAll(ctx, companyId, loaded.lines);
    const plan = loaded.plans.get("pr-watcher");
    if (plan === undefined || plan === "off") {
      ctx.logger.info("Signal pr-watcher: off, skipped.", { companyId });
      return undefined;
    }
    // A `pr-watcher` plan holds the `pr-watcher` rule's settings.
    const settings = plan.settings as PrWatcherSettings;
    const { inputs, tooLarge } = ruleInputs(now.toISOString(), settings, tasks);
    for (const task of tooLarge) {
      ctx.logger.error(`Signal pr-watcher: ${task} is too large for a rule input, left out.`, {
        companyId,
      });
    }
    const actions = inputs.flatMap(decide);
    const result = await signalPass({
      plan,
      actions,
      tasks: tasks.map((task) => task.task),
      state: await loadState(ctx, companyId),
      executors: dryRunSignalExecutors(plan.rule),
      now: now.toISOString(),
    });
    logAll(ctx, companyId, result.lines);
    await ctx.state.set(stateKey(companyId), result.state);
    return { tasks, actions };
  } catch (error) {
    ctx.logger.error(`Signal pr-watcher: couldn't run: ${(error as Error).message}`, {
      companyId,
    });
    return undefined;
  }
}
