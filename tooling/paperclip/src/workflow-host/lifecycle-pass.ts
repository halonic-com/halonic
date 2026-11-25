import type { Clock, IdGenerator } from "@halonicjs/ports";
import type { ScopeKey } from "@paperclipai/plugin-sdk";
import type { Snapshot } from "../snapshot/shape.ts";
import { type EngineHost, openEngineHost, pluginHubId } from "./engine-host.ts";
import type { EngineLock } from "./engine-lock.ts";
import { type EffectAction, type Executors, execute } from "./executors.ts";
import { lifecycleInput } from "./lifecycle-input.ts";
import type { RunStateClient } from "./plugin-run-store.ts";
import {
  decide,
  type LifecycleAction,
  type LifecycleRun,
  type StageAction,
} from "./rules/fast-track-lifecycle.ts";

/**
 * One pass of the fast-track lifecycle (HAL-17774), on the PR watcher's
 * snapshot. Under the engine lock it opens the engine, delivers the due
 * timers (the job's tick: `after: 15m` fires here), works out the actions
 * with the rule, sends each `stage` into the pull request's run through the
 * app's `sendEvent`, and hands the other actions to their executors once
 * per key. A run that ended as interrupted is started again and moved
 * straight to the stage the snapshot shows.
 */

/** A pull request's lifecycle run: its id, and how many runs it has had. */
interface RunEntry {
  readonly runId: string;
  readonly generation: number;
}

/** What the pass keeps between passes, per company. */
interface LifecycleState {
  readonly version: 1;
  /** The live run of each pull request, by `owner/name#123`. */
  readonly runs: Record<string, RunEntry>;
  /** The effect keys already carried out, with when. */
  readonly done: Record<string, string>;
}

/** What one pass needs. */
export interface LifecyclePassDeps {
  readonly state: RunStateClient;
  readonly companyId: string;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly lock: EngineLock;
  readonly executors: Executors;
}

/** What one pass did: its log lines, the rule's actions and the size of the rule's input in bytes. */
export interface LifecyclePassResult {
  readonly lines: readonly string[];
  readonly actions: readonly LifecycleAction[];
  readonly inputBytes: number;
}

function stateKey(companyId: string): ScopeKey {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "workflow-engine",
    stateKey: "fast-track",
  };
}

async function loadState(deps: LifecyclePassDeps): Promise<LifecycleState> {
  const stored = (await deps.state.get(stateKey(deps.companyId))) as LifecycleState | null;
  return stored?.version === 1 ? stored : { version: 1, runs: {}, done: {} };
}

/** The stage a run's state stands for: `review_late` is still `review`. */
function stageOfState(state: string | null): string | null {
  return state === "review_late" ? "review" : state;
}

async function runsOf(host: EngineHost, kept: LifecycleState): Promise<Map<string, LifecycleRun>> {
  const runs = new Map<string, LifecycleRun>();
  for (const [pr, entry] of Object.entries(kept.runs)) {
    const summary = await host.runs.get(entry.runId);
    if (summary !== null) {
      runs.set(pr, { state: summary.state, status: summary.status, since: summary.lastWaitingAt });
    }
  }
  return runs;
}

/** Starts a run for the pull request when it has none that lives, then sends it its stage. */
async function moveRun(
  host: EngineHost,
  runs: Record<string, RunEntry>,
  action: StageAction,
): Promise<string> {
  const entry = runs[action.pr];
  const summary = entry === undefined ? null : await host.runs.get(entry.runId);
  let runId = entry?.runId ?? "";
  let note = "";
  if (summary === null || summary.status === "failed" || summary.status === "completed") {
    const generation = (entry?.generation ?? 0) + 1;
    runId = `fast-track:${action.pr}:${generation}`;
    note = summary?.reason === "interrupted" ? ", started again after an interruption" : "";
    await host.executor.start({
      hubId: pluginHubId,
      workflowId: "fast-track",
      input: { pr: action.pr, task: action.task },
      runId,
    });
    await host.drain();
    runs[action.pr] = { runId, generation };
  }
  const before = stageOfState((await host.runs.get(runId))?.state ?? null);
  if (before !== action.stage) {
    await host.events.sendEvent(runId, "stage", undefined, {
      stage: action.stage,
      head: action.head,
    });
    await host.drain();
  }
  const where = action.task ?? action.pr;
  return `Fast-track lifecycle (dry run) ${where}: ${action.pr} ${before ?? "new"} -> ${action.stage}${note}.`;
}

async function carryOut(
  deps: LifecyclePassDeps,
  host: EngineHost,
  kept: LifecycleState,
  actions: readonly LifecycleAction[],
): Promise<{ lines: string[]; runs: Record<string, RunEntry>; done: Record<string, string> }> {
  const runs = { ...kept.runs };
  const done = { ...kept.done };
  const lines: string[] = [];
  for (const action of actions) {
    try {
      if (action.kind === "stage") {
        lines.push(await moveRun(host, runs, action));
      } else if (done[action.key] === undefined) {
        lines.push(await execute(deps.executors, action as EffectAction));
        done[action.key] = deps.clock.now().toISOString();
      }
    } catch (error) {
      lines.push(
        `Fast-track lifecycle: ${action.kind} for ${action.pr} failed: ${(error as Error).message}`,
      );
    }
  }
  return { lines, runs, done };
}

/** Forgets the runs that ended (merged or closed) and the effect keys of pull requests no longer in the input. */
async function prune(
  host: EngineHost,
  runs: Record<string, RunEntry>,
  done: Record<string, string>,
  inInput: ReadonlySet<string>,
): Promise<LifecycleState> {
  const live: Record<string, RunEntry> = {};
  for (const [pr, entry] of Object.entries(runs)) {
    if ((await host.runs.get(entry.runId))?.status === "completed") {
      await host.runs.remove(entry.runId);
    } else {
      live[pr] = entry;
    }
  }
  const keep = Object.entries(done).filter(([key]) => inInput.has(key.split("|")[1] ?? ""));
  return { version: 1, runs: live, done: Object.fromEntries(keep) };
}

/** Runs one pass for the deps' company, or says another worker holds the engine. */
export function lifecyclePass(
  deps: LifecyclePassDeps,
  snapshot: Snapshot,
): Promise<LifecyclePassResult | "held-elsewhere"> {
  return deps.lock.run(deps.companyId, deps.clock.now(), async () => {
    const host = openEngineHost(deps.state, deps.companyId, deps.clock, deps.ids);
    try {
      await host.drain();
      const kept = await loadState(deps);
      const input = lifecycleInput(snapshot, await runsOf(host, kept));
      const actions = decide(input);
      const { lines, runs, done } = await carryOut(deps, host, kept, actions);
      const inInput = new Set(input.pulls.map((pull) => pull.pr));
      await deps.state.set(stateKey(deps.companyId), await prune(host, runs, done, inInput));
      const inputBytes = new TextEncoder().encode(JSON.stringify(input)).byteLength;
      return { lines, actions, inputBytes };
    } finally {
      await host.close();
    }
  });
}
