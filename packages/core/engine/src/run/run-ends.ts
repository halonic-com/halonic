// How a run of the local executor ends: by a cancel, by a failure the engine
// writes, or by its own step, and what has to happen once it has: its child
// runs going on are cancelled, its calls stop, its folder and connectors end,
// and the meter counts a top-level run's end once (requirement `engine.meter-checks`).

import type { RunFailureReason } from "@halonicjs/events";
import type { RunStore } from "@halonicjs/ports";
import { readRun } from "../kernel/step.ts";
import type { RunsMeter } from "../meter/run-meter.ts";
import { appendFailed, type Failure } from "./append-failed.ts";
import { endChildrenOf, parentEnded } from "./child-runs.ts";
import type { LocalHarnessCalls } from "./local-harness-calls.ts";
import type { LocalModelCalls } from "./local-model-calls.ts";
import type { RunsProposalFolders } from "./proposal-folders.ts";
import type { RunsConnectors } from "./run-connectors.ts";

/** What {@link RunEnds} ends runs with. */
export interface RunEndsPorts {
  readonly store: RunStore;
  readonly folders: RunsProposalFolders;
  readonly modelCalls: Pick<LocalModelCalls, "stop" | "stopUnder">;
  readonly harnessCalls: Pick<LocalHarnessCalls, "stop" | "stopUnder">;
  readonly connectors: Pick<RunsConnectors, "ended"> | undefined;
  readonly meter: Pick<RunsMeter, "ended">;
  /** Tells a run's parent, if it has one, how the run is now. */
  tellParentOf(runId: string): Promise<void>;
  now(): string;
}

/** Ends the runs of the local executor, and does what a run's end calls for. */
export class RunEnds {
  readonly #ports: RunEndsPorts;

  constructor(ports: RunEndsPorts) {
    this.#ports = ports;
  }

  /**
   * Ends the run as cancelled, as `failure` says, and so its child runs still going. A run
   * that had already ended still has its child runs cancelled, but its end isn't counted again.
   */
  async cancelDown(runId: string, failure: Failure): Promise<void> {
    const endedNow = await this.#cancelOne(runId, failure);
    await this.ended(runId, failure, endedNow);
  }

  /**
   * A run has just ended: the child runs it started that are still going are
   * cancelled as `child` says, all the way down. Then, when it is a
   * top-level run, its harness calls and its child runs' stop, its proposal
   * folder and its connectors end, and last the meter counts its end, unless
   * `count` says it was counted already. It waits on those calls, so no
   * input recorded inside a harness call may end its run or any run above it
   * (today that is only `harness-asked`, which never does).
   */
  async ended(runId: string, child: Failure = parentEnded, count = true): Promise<void> {
    const { store, folders, modelCalls, harnessCalls, connectors, meter } = this.#ports;
    await endChildrenOf(store, runId, async (childRunId) => {
      await this.#cancelOne(childRunId, child);
    });
    await folders.ended(runId, async (topLevelRunId) => {
      modelCalls.stopUnder(topLevelRunId);
      await harnessCalls.stopUnder(topLevelRunId);
    });
    await connectors?.ended(runId);
    const run = count ? await readRun(store, runId) : null;
    if (run != null) await meter.ended(run);
  }

  /**
   * Ends a run that hasn't ended with `run.failed`, and tells its parent.
   *
   * @returns whether this call ended the run
   */
  async fail(
    runId: string,
    failure: Failure,
    reason: RunFailureReason = "error",
  ): Promise<boolean> {
    const ended = await appendFailed(this.#ports.store, runId, failure, reason, () =>
      this.#ports.now(),
    );
    if (ended) await this.#ports.tellParentOf(runId);
    return ended;
  }

  /**
   * Ends a run as cancelled, as `failure` says, and stops its harness and model calls.
   *
   * @returns whether this call ended the run
   */
  async #cancelOne(runId: string, failure: Failure): Promise<boolean> {
    const endedNow = await this.fail(runId, failure, "cancelled");
    this.#ports.modelCalls.stop(runId);
    await this.#ports.harnessCalls.stop(runId);
    return endedNow;
  }
}
