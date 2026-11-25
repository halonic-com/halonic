import { RunEvents } from "@halonicjs/app";
import {
  LocalExecutor,
  type LocalExecutorOptions,
  noListedToolApproval,
  type RunDefinitions,
} from "@halonicjs/engine";
import { parseFile } from "@halonicjs/format";
import type { Clock, IdGenerator } from "@halonicjs/ports";
import fastTrackWorkflowText from "./fast-track.workflow.yaml";
import { PluginStateBlobStore } from "./plugin-blob-store.ts";
import { PluginStateRunStore, type RunStateClient } from "./plugin-run-store.ts";
import prWatcherWorkflowText from "./pr-watcher.workflow.yaml";
import { TickScheduler } from "./tick-scheduler.ts";

/**
 * The engine inside the Agent tools plugin (HAL-17774), opened for one
 * pass of one company under the engine lock and closed at its end. It runs
 * on core packages only (Liam's condition on HAL-18009): the executor, the
 * app's `RunEvents` for `sendEvent`, and the plugin's own run store,
 * blob store and tick scheduler over plugin state. Its workflows only wait,
 * so no state calls a model.
 */

/** The hub the plugin's workflows run in; nothing looks it up. */
export const pluginHubId = "agent-tools";

/** How many rounds of due timers one drain delivers at most, so a broken workflow can't spin a pass. */
const maxDrainRounds = 50;

type DefinitionsOf = (hubId: string, workflowId: string) => Promise<RunDefinitions>;

/** The plugin's workflows, by id, as their YAML text. */
const workflowTexts: Readonly<Record<string, string>> = {
  "fast-track": fastTrackWorkflowText,
  "pr-watcher": prWatcherWorkflowText,
};

/** The plugin's workflows, parsed once per engine, by id. */
function pluginDefinitions(): DefinitionsOf {
  const workflows: Record<string, RunDefinitions["workflow"]> = {};
  for (const [id, text] of Object.entries(workflowTexts)) {
    const parsed = parseFile("workflow", text, { id });
    if (!parsed.ok) {
      const problems = parsed.error.map((problem) => problem.message).join("; ");
      throw new Error(`The ${id} workflow doesn't parse: ${problems}`);
    }
    workflows[id] = parsed.value.value;
  }
  return async (_hubId, workflowId) => {
    const workflow = workflows[workflowId];
    if (workflow === undefined) {
      throw new RangeError(`The Agent tools plugin has no workflow "${workflowId}".`);
    }
    return { workflow, connectorTools: {} };
  };
}

const noModel: LocalExecutorOptions["resolveModel"] = async () => {
  throw new Error("No state of the Agent tools plugin's workflows calls a model.");
};

/** The engine of one pass. */
export interface EngineHost {
  readonly executor: LocalExecutor;
  readonly runs: PluginStateRunStore;
  /** The app's event sender, as `halonic runs send` uses it. */
  readonly events: RunEvents;
  /** Delivers due timers until none is left: the job's tick, and the steps after a start or an event. */
  drain(): Promise<void>;
  close(): Promise<void>;
}

/** Opens the engine of `companyId` on plugin state. Only the engine lock's holder calls it. */
export function openEngineHost(
  state: RunStateClient,
  companyId: string,
  clock: Clock,
  ids: IdGenerator,
): EngineHost {
  let executor: LocalExecutor | undefined;
  const scheduler = new TickScheduler(
    state,
    companyId,
    {
      onTimer: async (timer) => {
        if (executor === undefined) {
          throw new Error("The engine is still opening; the timer is tried again.");
        }
        await executor.onTimer(timer);
      },
      // No routines run here: the pass itself is the job's tick.
      onTick: async () => {},
    },
    clock,
  );
  const runs = new PluginStateRunStore(state, companyId);
  const opened = new LocalExecutor({
    resolveModel: noModel,
    halonicTools: [],
    connectors: [],
    listedToolApproval: noListedToolApproval,
    secrets: { get: async () => null },
    clock,
    runs: {
      store: runs,
      blobs: new PluginStateBlobStore(state, companyId),
      scheduler,
      ids,
      definitionsOf: pluginDefinitions(),
    },
  });
  executor = opened;
  return {
    executor: opened,
    runs,
    events: new RunEvents(opened, runs),
    async drain() {
      for (let round = 0; round < maxDrainRounds; round += 1) {
        if ((await scheduler.runDue()) === 0) {
          return;
        }
      }
      throw new Error(
        `Timers were still due after ${maxDrainRounds} rounds; left for the next pass.`,
      );
    },
    async close() {
      await opened.close();
      await scheduler.close();
    },
  };
}
