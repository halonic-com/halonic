// The connectors a top-level run calls: started for the run, at the version
// its definitions were read from, rather than once for every run (HAL-6277,
// requirement `engine.run-connectors`). It follows the lifecycle of the
// proposal folders: keyed by the top-level run, so child runs share their
// parent's, and ended at the same point, once nothing of the run runs any
// more. Unlike a folder, it opens lazily, at the first step that needs a
// connector, so a run that calls none starts none.

import type { RunVersion } from "@halonicjs/events";
import type { ConnectorClient, RunStore } from "@halonicjs/ports";
import { hasEnded, type RunState } from "../kernel/run-state.ts";
import { readRun } from "../kernel/step.ts";
import { topLevelRunOf } from "./proposal-folders.ts";

/** The top-level run a run's connectors are started for. */
export interface ConnectorsRun {
  readonly runId: string;
  readonly hubId: string;
  readonly workflowId: string;
  /**
   * The version of the workspace the run's definitions were read from, as
   * its `run.started` names it: the same version its proposal folder is
   * made at. `null` in older logs, which didn't record it.
   */
  readonly version: RunVersion | null;
  /**
   * Whether the workspace is local only (`privacy.localOnly`): the host then
   * starts only the run's connectors that are `local`. The engine drops any
   * other it is given anyway (`engine.local-only`).
   */
  readonly localOnly: boolean;
}

/**
 * The connectors of top-level runs. The host starts each run's connectors
 * at the version the run's definitions were read from ({@link ConnectorsRun.version}),
 * so a run calls the connector code it started with, not what the
 * workspace has now. Whether pinned connectors are shared between runs is
 * the host's choice.
 */
export interface RunConnectors {
  /**
   * The run's started connectors. The engine calls it at each step that
   * needs a connector; opening a run that is open gives the same clients
   * again, and after the host started again, it starts them again.
   *
   * @throws when a connector of the run can't start; the step that needed it
   *   fails, and the next step tries again. The host closes those it did start.
   */
  open(run: ConnectorsRun): Promise<readonly ConnectorClient[]>;
  /**
   * Closes the run's connectors and releases what they were started from.
   * The engine calls it once nothing of the run runs any more, whether the
   * run completed, failed or was cancelled, and for a run with nothing open
   * too, which changes nothing.
   *
   * It doesn't throw: the run has already ended, and its cancel or its
   * parent's step must go on. What it can't release, it reports, and the
   * host clears it at its next `open`.
   */
  end(runId: string): Promise<void>;
}

/**
 * The connectors of the local executor's runs, on the host's
 * {@link RunConnectors}. Without them, every run calls the connectors the
 * executor was given, started once for all runs.
 */
export class RunsConnectors {
  readonly #runs: Pick<RunStore, "events" | "snapshot">;
  readonly #connectors: RunConnectors | undefined;
  readonly #shared: readonly ConnectorClient[];
  readonly #localOnly: boolean;

  /**
   * @param connectors - the host's connectors of top-level runs, if any
   * @param shared - the connectors every run calls when there are none
   * @param localOnly - whether runs use only connectors that are `local`
   */
  constructor(
    runs: Pick<RunStore, "events" | "snapshot">,
    connectors: RunConnectors | undefined,
    shared: readonly ConnectorClient[],
    localOnly = false,
  ) {
    this.#runs = runs;
    this.#connectors = connectors;
    this.#shared = shared;
    this.#localOnly = localOnly;
  }

  /**
   * The connectors a run calls: those of its top-level run. A child run,
   * and a `foreach` item, share them. In a local-only workspace, only those
   * that are `local`.
   *
   * @throws what the host's `open` throws, and when the top-level run ended
   *   while they opened: they are ended again, so none is left running
   */
  async of(run: RunState): Promise<readonly ConnectorClient[]> {
    if (this.#connectors === undefined) return this.#shared;
    const topLevel = await this.#topLevelOf(run);
    const opened = await this.#connectors.open({
      runId: topLevel.runId,
      hubId: topLevel.hubId,
      workflowId: topLevel.workflowId,
      version: topLevel.version,
      localOnly: this.#localOnly,
    });
    // A model call that was still going when the run was cancelled opens
    // them after their end: end them again, or nothing would.
    const now = await readRun(this.#runs, topLevel.runId);
    if (now === null || hasEnded(now.status)) {
      await this.#connectors.end(topLevel.runId);
      throw new Error(`Run "${topLevel.runId}" has ended, so its connectors are closed.`);
    }
    return this.#localOnly ? opened.filter((each) => each.local === true) : opened;
  }

  /**
   * Ends the connectors of a run that has just ended, when it is a
   * top-level run. A child run's end changes nothing: its connectors are
   * its top-level run's.
   */
  async ended(runId: string): Promise<void> {
    if (this.#connectors === undefined) return;
    const run = await readRun(this.#runs, runId);
    if (run === null || run.parent !== null) return;
    await this.#connectors.end(runId);
  }

  async #topLevelOf(run: RunState): Promise<RunState> {
    if (run.parent === null) return run;
    const runId = await topLevelRunOf(this.#runs, run);
    const topLevel = await readRun(this.#runs, runId);
    if (topLevel === null) throw new Error(`Run "${runId}" has no log.`);
    return topLevel;
  }
}
