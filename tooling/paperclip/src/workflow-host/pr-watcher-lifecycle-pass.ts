import type { ScopeKey } from "@paperclipai/plugin-sdk";
import type { PrWatcherAction, WatchedTask } from "../signals/rules/pr-watcher.ts";
import { type EngineHost, openEngineHost, pluginHubId } from "./engine-host.ts";
import type { LifecyclePassDeps } from "./lifecycle-pass.ts";
import {
  decide,
  type PrLifecycleInput,
  type PrLifecyclePull,
  type PrRun,
  type PrStageAction,
} from "./rules/pr-watcher-lifecycle.ts";

/**
 * One pass of the PR watcher's lifecycle (HAL-18197): each watched pull
 * request's run of the `pr-watcher` workflow, moved open -> merged -> green
 * -> done by the stages the rule works out from what the watcher read and
 * the `pr-watcher` signal rule's actions, each sent through the app's
 * `sendEvent`. It runs under the engine lock, on the same plugin-state run
 * store and tick scheduler as the fast-track lifecycle (HAL-17774), and
 * writes nothing to Paperclip or GitHub: today's watcher still does that.
 */

/** A pull request's lifecycle run: its id, and how many runs it has had. */
interface RunEntry {
  readonly runId: string;
  readonly generation: number;
  /** When the watcher last read the pull request, ISO. */
  readonly readAt: string;
}

/**
 * How long a run is kept while the watcher doesn't read its pull request:
 * it skips a task while its author runs, so a short gap is normal; a task
 * closed by hand is never read again.
 */
const keepUnreadMs = 7 * 24 * 60 * 60_000;

/** What the pass keeps between passes, per company. */
interface PrLifecycleState {
  readonly version: 1;
  /** The run of each watched pull request, by `owner/name#123`. */
  readonly runs: Record<string, RunEntry>;
}

/** What one pass needs: the fast-track pass's deps, without executors, since a stage has no side effect. */
export type PrLifecyclePassDeps = Omit<LifecyclePassDeps, "executors">;

/** What the watcher and the signal rule gave this pass. */
export interface WatcherPass {
  readonly tasks: readonly WatchedTask[];
  readonly actions: readonly PrWatcherAction[];
}

/** What one pass did: its log lines and the rule's actions. */
export interface PrLifecyclePassResult {
  readonly lines: readonly string[];
  readonly actions: readonly PrStageAction[];
}

function stateKey(companyId: string): ScopeKey {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "workflow-engine",
    stateKey: "pr-watcher",
  };
}

async function loadState(deps: PrLifecyclePassDeps): Promise<PrLifecycleState> {
  const stored = (await deps.state.get(stateKey(deps.companyId))) as PrLifecycleState | null;
  return stored?.version === 1 ? stored : { version: 1, runs: {} };
}

/** The pull requests the signal rule marks done this pass, as `task|owner/name#123`. */
function doneOf(actions: readonly PrWatcherAction[]): Set<string> {
  return new Set(
    actions.flatMap((action) =>
      action.kind === "task-update" ? action.pulls.map((pr) => `${action.task}|${pr}`) : [],
    ),
  );
}

/** The rule's input: every pull request of every watched task, with its run. */
async function inputOf(
  host: EngineHost,
  kept: PrLifecycleState,
  pass: WatcherPass,
): Promise<PrLifecycleInput> {
  const done = doneOf(pass.actions);
  const pulls: PrLifecyclePull[] = [];
  for (const task of pass.tasks) {
    for (const pull of task.pulls) {
      const entry = kept.runs[pull.pr];
      const summary = entry === undefined ? null : await host.runs.get(entry.runId);
      const run: PrRun | null =
        summary === null ? null : { state: summary.state, status: summary.status };
      pulls.push({
        pr: pull.pr,
        task: task.task,
        state: pull.state,
        landed: pull.landed,
        done: done.has(`${task.task}|${pull.pr}`),
        run,
      });
    }
  }
  return { pulls };
}

/** Starts a run for the pull request when it has none that lives, then sends it its stage. */
async function moveRun(
  host: EngineHost,
  runs: Record<string, RunEntry>,
  action: PrStageAction,
  now: string,
): Promise<string> {
  const entry = runs[action.pr];
  const summary = entry === undefined ? null : await host.runs.get(entry.runId);
  let runId = entry?.runId ?? "";
  const starts = summary === null || summary.status === "failed" || summary.status === "completed";
  if (starts) {
    const generation = (entry?.generation ?? 0) + 1;
    runId = `pr-watcher:${action.pr}:${generation}`;
    await host.executor.start({
      hubId: pluginHubId,
      workflowId: "pr-watcher",
      input: { pr: action.pr, task: action.task },
      runId,
    });
    await host.drain();
    runs[action.pr] = { runId, generation, readAt: now };
  }
  const current = (await host.runs.get(runId))?.state ?? null;
  if (current !== action.stage) {
    await host.events.sendEvent(runId, "stage", undefined, { stage: action.stage });
    await host.drain();
  }
  // A run just started already stands in its first state; it was new before this pass.
  const before = starts ? "new" : (current ?? "new");
  return `PR watcher lifecycle (dry run) ${action.task}: ${action.pr} ${before} -> ${action.stage}.`;
}

/**
 * Notes when each run's pull request was read, and forgets the runs that
 * ended and those the watcher hasn't read for {@link keepUnreadMs}.
 */
async function prune(
  host: EngineHost,
  runs: Record<string, RunEntry>,
  read: ReadonlySet<string>,
  now: Date,
): Promise<PrLifecycleState> {
  const live: Record<string, RunEntry> = {};
  for (const [pr, entry] of Object.entries(runs)) {
    const summary = await host.runs.get(entry.runId);
    const readAt = read.has(pr) ? now.toISOString() : entry.readAt;
    const stale = now.getTime() - Date.parse(readAt) > keepUnreadMs;
    if (summary !== null && summary.status !== "completed" && !stale) {
      live[pr] = { ...entry, readAt };
    } else if (summary !== null) {
      await host.runs.remove(entry.runId);
    }
  }
  return { version: 1, runs: live };
}

/** Runs one pass for the deps' company, or says another worker holds the engine. */
export function prWatcherLifecyclePass(
  deps: PrLifecyclePassDeps,
  pass: WatcherPass,
): Promise<PrLifecyclePassResult | "held-elsewhere"> {
  return deps.lock.run(deps.companyId, deps.clock.now(), async () => {
    const host = openEngineHost(deps.state, deps.companyId, deps.clock, deps.ids);
    try {
      await host.drain();
      const kept = await loadState(deps);
      const input = await inputOf(host, kept, pass);
      const actions = decide(input);
      const now = deps.clock.now();
      const runs = { ...kept.runs };
      const lines: string[] = [];
      for (const action of actions) {
        try {
          lines.push(await moveRun(host, runs, action, now.toISOString()));
        } catch (error) {
          lines.push(
            `PR watcher lifecycle: ${action.pr} -> ${action.stage} failed: ${(error as Error).message}`,
          );
        }
      }
      const read = new Set(input.pulls.map((pull) => pull.pr));
      await deps.state.set(stateKey(deps.companyId), await prune(host, runs, read, now));
      return { lines, actions };
    } finally {
      await host.close();
    }
  });
}
