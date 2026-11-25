// What the local executor's runs are given, and what they make of it: the
// effects they can carry out, and the budget check they keep to.

import type { RunFailureReason, RunVersion } from "@halonicjs/events";
import type {
  BlobStore,
  IdGenerator,
  RunStore,
  Scheduler,
  ToolScriptIsolate,
} from "@halonicjs/ports";
import type { Budget } from "../budget/budget.ts";
import type { BudgetCheck } from "../budget/keep-to-limits.ts";
import { spendOf } from "../budget/spend.ts";
import type { HarnessRunsOptions } from "../harness/harness-host.ts";
import type { Effect, RunDefinitions } from "../kernel/decide-types.ts";
import { noRunMeter, type RunMeter, RunsMeter } from "../meter/run-meter.ts";
import type { Failure } from "./append-failed.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import type { RunProposalFolders } from "./proposal-folders.ts";
import type { RunConnectors } from "./run-connectors.ts";

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
   * The definitions a new run of a workflow starts with. The run keeps them,
   * and never reads the workspace again. `version` is the start request's
   * `version`, the one the run records: a host that can read more than one
   * version gives the run that version's definitions, so the version a run
   * records is the one it runs. Without it, the workspace as it is now.
   * `runId` is the id of the run being started, so a host can keep what it
   * read for that run, such as the files its connectors start from.
   *
   * @throws when the hub or the workflow doesn't exist
   */
  definitionsOf(
    hubId: string,
    workflowId: string,
    version: RunVersion | undefined,
    runId: string,
  ): Promise<RunDefinitions>;
  /**
   * What runs whose agents name a harness need. Without it, such a run fails
   * at its harness step with an error that names the `run-harness` effect.
   */
  readonly harnesses?: HarnessRunsOptions;
  /**
   * The proposal folders of top-level runs that can write files: their
   * harness agents write there instead of in the workspace. Without them,
   * no run gets one, and harness agents write where their profiles say.
   */
  readonly proposalFolders?: RunProposalFolders;
  /**
   * The workspace's run and monthly budget as it is now, read before every
   * model call and harness run; `undefined` sets none. Without it, no budget
   * stops a run.
   */
  budget?(): Promise<Budget | undefined>;
  /**
   * Whether a harness step may start now, asked before each one starts, so a
   * host that hears trust removed late still starts no harness program
   * (HAL-12811). A no, or a check that rejects, fails the step before
   * anything starts, as the model resolver refuses a model call in a
   * workspace that isn't trusted. Without it, every harness step may start.
   */
  mayStartHarness?(): Promise<boolean>;
  /**
   * Counts each customer's usage and refuses at their plan's limits: before a
   * run starts, and before each model call and harness run. Without it,
   * `NoMeter` for the workspace's owner, which allows everything.
   */
  readonly meter?: RunMeter;
  /**
   * What runs need to reach connectors. Without it, a run's model call
   * offers no connector's tools, and a `call-tool` effect fails the run.
   */
  readonly connectorCalls?: RunConnectorCalls;
  /**
   * The connectors of top-level runs, started for each run at the version
   * its definitions were read from. Without them, every run calls the
   * executor's `connectors`, started once for all runs.
   */
  readonly runConnectors?: RunConnectors;
  /**
   * Whether getting ready ends the runs the engine lost when it last stopped, and marks their
   * connector calls cut short (requirement `engine.skip-lost-run-sweep`). `true` when left out:
   * the sweep takes every `running` run in the store for lost, so only the one engine on a store
   * may do it. Set `false` where many engines share one store, as each isolate and run object's
   * engine on the Worker does: there a sweep would end the other engines' live runs, and the
   * watchdog finds stuck runs instead.
   */
  readonly sweepsLostRuns?: boolean;
  /**
   * Where the rules of `rule` states run, each in a fresh isolate with no
   * host functions (requirement `engine.rule-state`). Without it, a run fails
   * at its first rule step with an error that says so.
   */
  readonly toolScriptIsolate?: ToolScriptIsolate;
}

/**
 * The effects this executor carries out: harness runs, and answers to their
 * approvals, only when it has `harnesses`, and connector calls, with the
 * checks of tool steps' calls, only when it has `connectorCalls`.
 */
export function builtEffectsOf(options: LocalRunsOptions): ReadonlySet<Effect["type"]> {
  const built: Effect["type"][] = [
    "call-model",
    "set-timer",
    "start-child",
    "tell-parent",
    "cancel-child",
  ];
  if (options.harnesses !== undefined) built.push("run-harness", "answer-harness");
  if (options.connectorCalls !== undefined) built.push("call-tool", "check-tool");
  if (options.toolScriptIsolate !== undefined) built.push("run-rule");
  return new Set(built);
}

/**
 * How a run fails when its step asks for an effect that isn't `built`;
 * `undefined` when every effect is.
 */
export function unbuiltEffectFailure(
  effects: readonly Effect[],
  built: ReadonlySet<Effect["type"]>,
): { readonly failure: Failure; readonly reason: RunFailureReason } | undefined {
  const unbuilt = effects.find((effect) => !built.has(effect.type));
  if (unbuilt === undefined) return undefined;
  if (unbuilt.type === "run-rule") {
    const error = `Step "${unbuilt.state}" is a rule step, and rule steps can't run here yet. Remove the step to run this workflow.`;
    return { failure: { error }, reason: "error" };
  }
  if (unbuilt.type === "check-tool") {
    const error = `Step "${unbuilt.state}" is a tool step, and tool steps can't call connectors here yet. Remove the step to run this workflow.`;
    return { failure: { error }, reason: "error" };
  }
  return {
    failure: { error: `The local executor can't carry out a ${unbuilt.type} effect yet.` },
    reason: unbuilt.type === "run-harness" ? "harness-unavailable" : "error",
  };
}

/** What the runs in `options.store` are kept to: their budget, when the options give one, and their meter. */
export interface LocalRunLimits {
  readonly budget?: BudgetCheck;
  readonly meter: RunsMeter;
}

/** The budget check of runs in `options.store`, when the options give a budget. */
export function budgetCheckOf(options: LocalRunsOptions): BudgetCheck | undefined {
  const budget = options.budget;
  if (budget === undefined) return undefined;
  return { budget, spend: (run, at) => spendOf(options.store, run, at) };
}

/** The limits of runs in `options.store`: the budget the options give, if any, and their meter or `NoMeter`. */
export function runLimitsOf(options: LocalRunsOptions): LocalRunLimits {
  const meter = new RunsMeter(options.meter ?? noRunMeter(), options.store);
  const budget = budgetCheckOf(options);
  return budget === undefined ? { meter } : { budget, meter };
}

/**
 * The runs options with a local-only workspace's `localOnly` handed on to
 * their harnesses, so each harness call, a run's or a chat turn's, refuses
 * before anything starts (requirement `engine.local-only`).
 */
export function runsOptionsOf(
  runs: LocalRunsOptions | undefined,
  localOnly: boolean,
): LocalRunsOptions | undefined {
  if (!localOnly || runs?.harnesses === undefined) return runs;
  return { ...runs, harnesses: { ...runs.harnesses, localOnly } };
}
