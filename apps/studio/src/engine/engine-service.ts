// The engine of the open workspace, run in the Studio's page (HAL-10236). It
// is the CLI's engine with the page's parts: the shell's stores for runs,
// blobs and records (the same files the CLI reads), the keychain for secrets,
// and the shell's engine lock, which the page takes on the first start or send
// and keeps until the workspace changes or the window closes. What doesn't
// depend on the runtime (the executor's options, the collection names, the
// close order) is shared with the CLI: `workspaceExecutorOptions` and
// `assembleEngine`.
//
// In 0.1 the page has models and secrets only: a workflow that needs a
// connector or an agent in a harness is refused as `unavailable` before the
// engine opens, since the page can start neither.

import { NodeCoordination } from "@halonicjs/adapter-coordination-node";
import { TauriBlobStore, TauriRecordStore, TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import { nodeSchedulerFactory, type SetTimer } from "@halonicjs/adapter-scheduler-node";
import {
  routineStateCollection,
  runTimerCollection,
  startsAProgram,
  type WorkflowRef,
  workflowAgentsOf,
  workspaceExecutorOptions,
} from "@halonicjs/adapter-workspace-models";
import { type AssembledEngine, assembleEngine } from "@halonicjs/engine";
import type { Clock, DefinitionStore, HttpClient, IdGenerator, Secrets } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { TauriIpc } from "@halonicjs/studio-services";
import { loadWorkspace, runDefinitionsOf } from "@halonicjs/workspace";

/** What an {@link EngineService} is built from. */
export interface EngineServiceOptions {
  /** The shell: its run, blob and record commands and the engine lock. */
  readonly ipc: TauriIpc;
  /** The workspace folder, as the person opened it in the shell. */
  readonly location: string;
  /** The workspace's files, read when the engine opens. */
  readonly definitions: DefinitionStore;
  /** The keychain, as `Secrets`. */
  readonly secrets: Secrets;
  /** What the model providers call their servers with. */
  readonly http: HttpClient;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** How the scheduler wakes itself up. */
  readonly setTimer: SetTimer;
  /** A new token for the routine state's leases. */
  readonly newToken: () => string;
  /** Hears each error the engine handles itself, such as a timer that will be retried. */
  reportError(error: unknown): void;
}

/** The engine of one workspace in the page, opened on first use. */
export class EngineService {
  readonly #options: EngineServiceOptions;
  #opening: Promise<AssembledEngine> | undefined;

  constructor(options: EngineServiceOptions) {
    this.#options = options;
  }

  /**
   * The engine, opening it on the first call: takes the shell's engine lock,
   * then builds the engine on the workspace's files. Later calls give the
   * same engine. A call that fails leaves nothing held, so the next call tries again.
   *
   * @throws KindedError `conflict` when another engine, the CLI's or another
   *   window's, holds the workspace's lock
   */
  open(): Promise<AssembledEngine> {
    this.#opening ??= this.#openOnce().catch((error: unknown) => {
      this.#opening = undefined;
      throw error;
    });
    return this.#opening;
  }

  /**
   * Refuses a workflow the page can't run, before the engine opens: one with
   * an agent in a harness, or with an agent that lists a connector.
   *
   * @throws KindedError `unavailable` naming the agent
   * @throws RangeError when the hub or the workflow doesn't exist
   */
  async check(run: WorkflowRef): Promise<void> {
    const workspace = await loadWorkspace(this.#options.definitions);
    runDefinitionsOf(workspace, run.hubId, run.workflowId);
    for (const { value: agent } of workflowAgentsOf(workspace, run)) {
      if (startsAProgram(agent.harness)) {
        throw unavailable(agent.name, "runs in a harness program");
      }
      if (agent.connectors.length > 0) {
        throw unavailable(agent.name, "uses a connector");
      }
    }
  }

  /**
   * Closes the engine, if open, and gives the workspace's lock back, as when
   * the workspace changes. Safe to call twice; a later {@link open} starts afresh.
   */
  async close(): Promise<void> {
    const opening = this.#opening;
    this.#opening = undefined;
    if (opening === undefined) return;
    const engine = await opening.catch(() => undefined);
    await engine?.close();
  }

  async #openOnce(): Promise<AssembledEngine> {
    const { ipc, location, clock, reportError } = this.#options;
    await holdLock(ipc, location);
    try {
      const workspace = await loadWorkspace(this.#options.definitions);
      return assembleEngine({
        createScheduler: nodeSchedulerFactory({
          store: new TauriRecordStore(ipc, location),
          collection: runTimerCollection,
          clock,
          setTimer: this.#options.setTimer,
          reportError,
        }),
        executor: {
          ...workspaceExecutorOptions({
            workspace,
            secrets: this.#options.secrets,
            http: this.#options.http,
            clock,
          }),
          runs: {
            store: new TauriRunStore(ipc, location),
            blobs: new TauriBlobStore(ipc, location),
            ids: this.#options.ids,
            definitionsOf: async (hubId, workflowId) =>
              runDefinitionsOf(workspace, hubId, workflowId),
          },
        },
        coordination: new NodeCoordination({
          store: new TauriRecordStore(ipc, location),
          collection: routineStateCollection,
          clock,
          newToken: this.#options.newToken,
        }),
        // Last, so no other engine starts while this one still delivers a timer.
        release: () => releaseLock(ipc, location),
      });
    } catch (error) {
      await releaseLock(ipc, location);
      throw error;
    }
  }
}

/** Takes the shell's engine lock, or refuses with a `conflict` that names the other process. */
async function holdLock(ipc: TauriIpc, location: string): Promise<void> {
  try {
    await ipc.invoke("engine_lock_hold", { workspace: location });
  } catch (refusal) {
    throw lockRefusal(refusal);
  }
}

async function releaseLock(ipc: TauriIpc, location: string): Promise<void> {
  await ipc.invoke("engine_lock_release", { workspace: location });
}

/** The shell's refusal as an error: `conflict` for a lock another engine holds, else `unavailable`. */
function lockRefusal(refusal: unknown): KindedError {
  const { kind, message, pid } = refusalOf(refusal);
  if (kind === "conflict") {
    const holder = pid === undefined ? "another engine" : `another engine (process ${pid})`;
    return new KindedError("conflict", `This workspace is open in ${holder}.`, {
      fix: "Close it, then try again.",
      cause: refusal,
    });
  }
  return new KindedError("unavailable", message ?? "The workspace's engine can't start here.", {
    cause: refusal,
  });
}

function refusalOf(refusal: unknown): { kind?: string; message?: string; pid?: number } {
  if (typeof refusal !== "object" || refusal === null) return {};
  const { kind, message, pid } = refusal as Record<string, unknown>;
  return {
    ...(typeof kind === "string" ? { kind } : {}),
    ...(typeof message === "string" ? { message } : {}),
    ...(typeof pid === "number" ? { pid } : {}),
  };
}

function unavailable(agentName: string, why: string): KindedError {
  return new KindedError("unavailable", `${agentName} ${why}, which this window can't start yet.`, {
    fix: "Run this workflow from the command line.",
  });
}
