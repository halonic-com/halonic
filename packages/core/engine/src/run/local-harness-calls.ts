// The harness side of the local executor's runs: it carries out the harness
// calls runs wait on, hands a person's answer to the call that asked for it,
// and stops every call when the engine stops.

import type { RunEvent } from "@halonicjs/events";
import type { BlobStore, Clock, RunStore } from "@halonicjs/ports";
import type { StopSignal } from "@halonicjs/std";
import { RunCallBudget } from "../budget/call-budget.ts";
import type { BudgetCheck } from "../budget/keep-to-budget.ts";
import type { HarnessRunsOptions } from "../harness/harness-host.ts";
import { type HarnessApprovals, runHarnessCall } from "../harness/run-harness-call.ts";
import { SerialRunLog, type WaitedOnCall } from "../harness/serial-run-log.ts";
import { programHarnessOf } from "../kernel/agent-call.ts";
import type { AnswerHarnessEffect, DecideInput } from "../kernel/decide-types.ts";
import { definitionsOf } from "../kernel/kept-definitions.ts";
import type { PendingCall, RunState } from "../kernel/run-state.ts";
import { HarnessAnswers } from "./harness-answers.ts";
import { LiveHarnessCalls } from "./live-harness-calls.ts";
import { type RunsProposalFolders, topLevelRunOf } from "./proposal-folders.ts";
import type { StartDeadlines } from "./start-deadlines.ts";

/** What the harness calls of local runs need from the runs they belong to. */
export interface HarnessCallsOptions {
  readonly store: RunStore;
  readonly blobs: BlobStore;
  /** What harness calls need; without it, each call fails with an error that says so. */
  readonly harnesses: HarnessRunsOptions | undefined;
  /** Where each call's agent writes workspace files: its top-level run's proposal folder. */
  readonly folders: RunsProposalFolders;
  readonly startDeadlines: StartDeadlines;
  readonly clock: Clock;
  /** The budget each call's model calls keep to, one by one; none when left out. */
  readonly budget?: BudgetCheck;
  /**
   * Steps the run with an input, as the executor records any other.
   *
   * @returns the events the step stored
   */
  record(runId: string, input: DecideInput): Promise<readonly RunEvent[]>;
}

/** The harness calls of the local executor's runs. */
export class LocalHarnessCalls {
  readonly #options: HarnessCallsOptions;
  readonly #live = new LiveHarnessCalls();
  readonly #answers = new HarnessAnswers();

  constructor(options: HarnessCallsOptions) {
    this.#options = options;
  }

  /**
   * Runs the agent of a harness call in its harness: the run's own, or the
   * one the agent's file names in the run's kept definitions, as `decide`
   * read them when it asked for the run. Each time a person answers an approval
   * the harness asked for, `waitedOn` moves on to the call id the run then
   * waits on.
   *
   * The agent writes workspace files in the proposal folder of the run's
   * top-level run, which the run's child runs share. With a `budget`, each
   * model call the harness makes keeps to it, and the call stops once it is
   * reached.
   *
   * @throws when there are no `harnesses`, the definitions are gone, the
   *   agent names no harness, the top-level run has no proposal folder where
   *   the host has them, the harness run fails, or the engine stops it
   * @throws BudgetReachedError when the run's budget refused one of its model calls
   */
  async run(run: RunState, call: PendingCall, waitedOn: WaitedOnCall): Promise<unknown> {
    const { store, blobs, harnesses, folders, startDeadlines, clock, budget } = this.#options;
    if (harnesses === undefined) {
      throw new Error(
        "The local executor can't carry out a run-harness effect: it has no harnesses.",
      );
    }
    const definitions = await definitionsOf(blobs, run.definitionsVersion);
    const agents = definitions.agents ?? {};
    const agent = Object.hasOwn(agents, call.agent) ? agents[call.agent] : undefined;
    const harness = programHarnessOf(run, agents, call.agent);
    if (agent === undefined || harness === null) {
      throw new Error(
        `Agent "${call.agent}" runs in no harness in the definitions this run started with.`,
      );
    }
    const effect = { ...call, harness };
    const { runId, hubId, lastSeq } = run;
    const topLevelRunId = await topLevelRunOf(store, run);
    const filesFolder = await folders.folderOf(run, topLevelRunId);
    const item = run.foreach?.running.find(
      (running) => "call" in running && running.call.callId === call.callId,
    );
    const log = new SerialRunLog(store, runId, waitedOn, lastSeq, clock, item?.item ?? null);
    const limits = startDeadlines.of(runId, call.callId);
    const running = (stop: StopSignal) => {
      const approvals = this.#approvalsOf(runId, call.agent, waitedOn, stop);
      const harnessCall = {
        effect,
        runId,
        hubId,
        agent,
        filesFolder,
        ...(budget === undefined ? {} : { budget: new RunCallBudget(budget, run, clock) }),
      };
      return runHarnessCall(harnesses, harnessCall, log, approvals, limits, stop);
    };
    return this.#live.run(runId, running, topLevelRunId);
  }

  /**
   * Hands a person's answer to the run's harness call that asked for it,
   * which still runs.
   *
   * @returns false when no harness call of this engine waits for it, as after a restart
   */
  answer(runId: string, effect: AnswerHarnessEffect): boolean {
    return this.#answers.give(runId, effect);
  }

  /** Stops the run's harness calls going on, and resolves once each has stopped all it started. */
  stop(runId: string): Promise<void> {
    return this.#live.stop(runId);
  }

  /**
   * Stops the harness calls going on in a top-level run and its child runs,
   * and resolves once each has stopped all it started.
   */
  stopUnder(topLevelRunId: string): Promise<void> {
    return this.#live.stopUnder(topLevelRunId);
  }

  /** Stops every harness call going on, and resolves once each has stopped all it started. */
  stopAll(): Promise<void> {
    return this.#live.stopAll();
  }

  /**
   * How a harness call of the run asks for a person's OK: the run records
   * the question under the call it waits on, and waits for `approve` or
   * `reject`. The answer moves `waitedOn` on to the call that goes on.
   *
   * Only a task state waits for a person while its harness call runs. When
   * the run doesn't take the question, as in an item of a `foreach` state,
   * the ask throws, so the call fails instead of waiting for an answer that
   * never comes.
   */
  #approvalsOf(
    runId: string,
    agent: string,
    waitedOn: WaitedOnCall,
    stop: StopSignal,
  ): HarnessApprovals {
    return {
      ask: async ({ tool, args }) => {
        const answer = await this.#answers.waitFor(runId, stop, async () => {
          const events = await this.#options.record(runId, {
            type: "harness-asked",
            at: this.#options.clock.now().toISOString(),
            callId: waitedOn.callId,
            tool,
            args,
          });
          if (!events.some(({ type }) => type === "approval.requested")) {
            throw new Error(
              `Agent "${agent}" asked for an approval of "${tool}" where its run can't wait for one, as in an item of a for-each state.`,
            );
          }
        });
        waitedOn.callId = answer.callId;
        return answer;
      },
    };
  }
}
