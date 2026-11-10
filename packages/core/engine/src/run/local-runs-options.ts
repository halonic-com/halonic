// What the local executor's runs are given, and what they make of it: the
// effects they can carry out, and the budget check they keep to.

import type { BlobStore, IdGenerator, RunStore, Scheduler } from "@halonicjs/ports";
import type { Budget } from "../budget/budget.ts";
import type { BudgetCheck } from "../budget/keep-to-budget.ts";
import { spendOf } from "../budget/spend.ts";
import type { HarnessRunsOptions } from "../harness/harness-host.ts";
import type { Effect, RunDefinitions } from "../kernel/decide-types.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";

/** What the local executor needs to run workflows, on top of what chat turns need. */
export interface LocalRunsOptions {
  readonly store: RunStore;
  /** Where each run keeps the definitions it started with. */
  readonly blobs: BlobStore;
  /**
   * Wakes runs. Its listener's `onTimer` must call the executor's `onTimer`;
   * create it with a listener that forwards to the executor once it exists.
   */
  readonly scheduler: Scheduler;
  /** Gives a run its id when the start request names none. */
  readonly ids: IdGenerator;
  /**
   * The definitions a new run of a workflow starts with, as the workspace has
   * them now. The run keeps them, and never reads the workspace again.
   *
   * @throws when the hub or the workflow doesn't exist
   */
  definitionsOf(hubId: string, workflowId: string): Promise<RunDefinitions>;
  /**
   * What runs whose agents name a harness need. Without it, such a run fails
   * at its harness step with an error that names the `run-harness` effect.
   */
  readonly harnesses?: HarnessRunsOptions;
  /**
   * The workspace's run and monthly budget as it is now, read before every
   * model call and harness run; `undefined` sets none. Without it, no budget
   * stops a run.
   */
  budget?(): Promise<Budget | undefined>;
  /**
   * What runs need to reach connectors. Without it, a run's model call
   * offers no connector's tools, and a `call-tool` effect fails the run.
   */
  readonly connectorCalls?: RunConnectorCalls;
}

/**
 * The effects this executor carries out: harness runs, and answers to their
 * approvals, only when it has `harnesses`, and connector calls only when it
 * has `connectorCalls`.
 */
export function builtEffectsOf(options: LocalRunsOptions): ReadonlySet<Effect["type"]> {
  const built: Effect["type"][] = ["call-model", "set-timer", "start-child", "tell-parent"];
  if (options.harnesses !== undefined) built.push("run-harness", "answer-harness");
  if (options.connectorCalls !== undefined) built.push("call-tool");
  return new Set(built);
}

/** The budget check of runs in `options.store`, when the options give a budget. */
export function budgetCheckOf(options: LocalRunsOptions): BudgetCheck | undefined {
  const budget = options.budget;
  if (budget === undefined) return undefined;
  return { budget, spend: (run, at) => spendOf(options.store, run, at) };
}
