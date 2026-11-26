// Runs a writer step under the early hedge (requirement
// `engine.harness-early-hedge`, HAL-18800; Liam's notes on HAL-18801). The
// policy in `retry-detectors` decides when to start, stop and ship
// attempts; this file runs each attempt as a harness call of its own, in a
// files folder, sandbox session and bridge of its own, and carries out what
// the policy decided: it ships one attempt's change, or runs the step again
// on the fallback model.

import type { RunEventBody } from "@halonicjs/events";
import {
  AttemptStepRecorder,
  type FinishedAttempt,
  type HedgeAttempt,
  type HedgeDecision,
  hedgeApplies,
  runEarlyHedge,
  type WriterEvent,
  type WriterSetup,
} from "@halonicjs/retry-detectors";
import { type StopSignal, StopSource } from "@halonicjs/std";
import { noCallBudget } from "../budget/call-budget.ts";
import type { AttemptFolder, EarlyHedgeHost, HedgeStepDecision } from "./early-hedge-host.ts";
import type { HarnessAgent } from "./harness-host.ts";
import { SerialCallBudget, SharedStepSpend } from "./hedge-spend.ts";
import type { HarnessApprovals, HarnessCall, HarnessEventLog } from "./run-harness-call.ts";
import type { StartLimits } from "./start-limits.ts";

/** Runs one attempt of a harness call to its result, as `runPreparedHarnessCall` does. */
export type RunAttempt = (
  call: HarnessCall,
  log: HarnessEventLog,
  approvals: HarnessApprovals,
  limits: StartLimits,
  stop: StopSignal,
) => Promise<unknown>;

/** A writer step the early hedge applies to: the host's hedge and the setup it runs on. */
export interface HedgedWriter {
  readonly host: EarlyHedgeHost;
  readonly setup: WriterSetup;
}

/**
 * Whether the step runs under the early hedge: only with the host's pilot
 * flag on, on the setup the detectors were fitted on, and for an agent whose
 * file says `asks: in-sandbox`, so no attempt would ask a person anything.
 *
 * @returns the hedge to run it with, or `null` to run it once, as before
 * @throws what the host's `setupOf` throws
 */
export async function hedgedWriterOf(
  host: EarlyHedgeHost | undefined,
  call: HarnessCall,
  agent: HarnessAgent,
): Promise<HedgedWriter | null> {
  if (host === undefined || !host.config.enabled || call.agent.asks !== "in-sandbox") return null;
  const setup = await host.setupOf(agent);
  return setup !== null && hedgeApplies(host.config, setup) ? { host, setup } : null;
}

/**
 * An attempt that asked for a person's OK. The question never reaches a
 * person and the tool it was about never runs: the attempt stops, and the
 * decision log says why, apart from model failures.
 */
export class ApprovalRequestedError extends Error {
  override readonly name = "ApprovalRequestedError";
}

/** What every attempt of one hedged step shares. */
interface HedgedStep {
  readonly call: HarnessCall;
  readonly agent: HarnessAgent;
  readonly writer: HedgedWriter;
  readonly runAttempt: RunAttempt;
  /** The run's own log, which an attempt's spend goes to at once. */
  readonly log: HarnessEventLog;
  readonly limits: StartLimits;
  readonly budget: SerialCallBudget;
  readonly spend: SharedStepSpend;
  /** Stops every attempt: the engine's stop, or a shared limit reached. */
  readonly stopAll: StopSignal;
  /** The run's files version the attempts start from. */
  readonly version: string;
  readonly now: () => number;
}

/**
 * Runs the step under the early hedge.
 *
 * Every attempt runs the call in a folder of its own, made at the version
 * the run's files are at, with a sandbox session and a bridge of its own.
 * Its model calls go to the run's log at once, so the run's budget counts
 * them, also for an attempt that never ships; the rest of what it reports is
 * kept, and only the shipped attempt's goes to the log. All attempts keep
 * to one budget, checked one model call at a time, and to the agent's
 * `harnessLimits` for cost, tokens and running time together; turns are
 * counted per attempt.
 *
 * On `ship`, the attempt's change goes to the run's files, unless they moved
 * since the attempts started: then, as on `fallback`, the step runs once
 * more on the host's fallback model, in the run's own folder, with what is
 * left of the limits.
 *
 * Every attempt's folder is released, and its session and bridge closed,
 * before it returns or throws, however it ends.
 *
 * @returns the `output` of the shipped attempt's or the fallback's `agent.finished`
 * @throws `stop.reason` when the engine stopped the step
 * @throws HarnessLimitError or BudgetReachedError when the attempts together reached a limit
 * @throws what the policy, the host's folders or the fallback throw
 */
export async function runHedgedWriter(
  { call, agent, writer, runAttempt }: Pick<HedgedStep, "call" | "agent" | "writer" | "runAttempt">,
  log: HarnessEventLog,
  approvals: HarnessApprovals,
  limits: StartLimits,
  stop: StopSignal,
): Promise<unknown> {
  const { host } = writer;
  const now = host.now ?? Date.now;
  const stopAll = new StopSource();
  const stopWithEngine = stop.onStop(() => {
    if (stop.reason !== undefined) stopAll.stop(stop.reason);
  });
  const spend = new SharedStepSpend(
    call.agent.harnessLimits,
    { agent: call.effect.agent, harness: call.effect.harness },
    (error) => stopAll.stop(error),
    now,
  );
  const attempts: Attempt[] = [];
  try {
    const step: HedgedStep = {
      call,
      agent,
      writer,
      runAttempt,
      log,
      limits,
      budget: new SerialCallBudget(call.budget ?? noCallBudget),
      spend,
      stopAll: stopAll.signal,
      version: await host.folders.versionOf(agent),
      now,
    };
    await spend.startClock(limits);
    const outcome = await runEarlyHedge({
      config: host.config,
      setup: writer.setup,
      start: (number) => {
        const attempt = new Attempt(step, number);
        attempts.push(attempt);
        return attempt.hedge;
      },
      log: (decision) => host.decided?.(relabelled(decision, attempts)),
      now,
      sleep: (ms) => limits.wait(ms),
    });
    await spend.stopClock();
    stopAll.signal.throwIfStopped();
    if (outcome.kind === "ship") {
      const shipped = attempts[outcome.attempt - 1];
      if (shipped !== undefined && (await host.folders.versionOf(agent)) === step.version) {
        return await shipped.ship(log);
      }
      host.decided?.({ kind: "files-moved", attempt: outcome.attempt });
    }
    const fallback: HarnessCall = {
      ...call,
      agent: { ...call.agent, model: host.fallbackModel, harnessLimits: spend.left() },
    };
    return await runAttempt(fallback, log, approvals, limits.forAttempt("fallback"), stop);
  } finally {
    stopWithEngine();
    await spend.stopClock();
    stopAll.stop(new Error("The hedged writer step ended."));
    await Promise.all(attempts.map((attempt) => attempt.release()));
  }
}

/**
 * The policy's decision as the host hears it: an attempt that failed because
 * it asked for a person's OK is `approval-requested`, not a failure, so it
 * never counts as one in the detectors' numbers.
 */
function relabelled(decision: HedgeDecision, attempts: readonly Attempt[]): HedgeStepDecision {
  if (decision.kind !== "failed" || !attempts[decision.attempt - 1]?.askedForApproval) {
    return decision;
  }
  return { kind: "approval-requested", attempt: decision.attempt, atSeconds: decision.atSeconds };
}

/** One attempt of a hedged step, in its own folder, as the policy drives it. */
class Attempt {
  readonly #step: HedgedStep;
  readonly #number: number;
  readonly #stop = new StopSource();
  readonly #recorder: AttemptStepRecorder;
  readonly #startedAtMs: number;
  /** What it reported besides its spend, for the log once it ships. */
  readonly #kept: RunEventBody[] = [];
  readonly #run: Promise<unknown>;
  readonly #unlisten: () => void;
  #folder: Promise<AttemptFolder> | undefined;
  askedForApproval = false;
  readonly hedge: HedgeAttempt;

  constructor(step: HedgedStep, number: number) {
    this.#step = step;
    this.#number = number;
    this.#startedAtMs = step.now();
    this.#recorder = new AttemptStepRecorder(this.#startedAtMs);
    this.#unlisten = step.stopAll.onStop(() => {
      if (step.stopAll.reason !== undefined) this.#stop.stop(step.stopAll.reason);
    });
    this.#run = this.#go();
    this.hedge = {
      steps: () => this.#recorder.steps(),
      finished: this.#finished(),
      stop: async () => {
        this.#stop.stop(new Error(`The early hedge stopped attempt ${number}.`));
        await this.#run.catch(() => {});
      },
    };
  }

  /**
   * Writes what the attempt reported to the run's log, and applies its change to the run's files.
   *
   * @returns the attempt's result
   * @throws when the log or the folder doesn't take it
   */
  async ship(log: HarnessEventLog): Promise<unknown> {
    const output = await this.#run;
    for (const event of this.#kept) await log.append(event);
    await (await this.#openedFolder()).ship();
    return output;
  }

  /** Stops the attempt if it still runs, waits until it has closed all it opened, and removes its folder. */
  async release(): Promise<void> {
    this.#unlisten();
    this.#stop.stop(new Error(`The hedged writer step ended before attempt ${this.#number}.`));
    await this.#run.catch(() => {});
    const folder = await this.#folder?.catch(() => undefined);
    await folder?.release();
  }

  async #go(): Promise<unknown> {
    const { call, agent, writer, runAttempt, limits, budget, version, stopAll } = this.#step;
    // A successor the policy starts after the step was stopped opens nothing.
    stopAll.throwIfStopped();
    this.#folder = writer.host.folders.open(agent, this.#number, version);
    const folder = await this.#openedFolder();
    this.#stop.signal.throwIfStopped();
    return await runAttempt(
      { ...call, filesFolder: folder.path, budget },
      this.#log(),
      this.#approvals(),
      limits.forAttempt(`hedge-${this.#number}`),
      this.#stop.signal,
    );
  }

  #openedFolder(): Promise<AttemptFolder> {
    if (this.#folder === undefined) throw new Error("The attempt's folder isn't open yet.");
    return this.#folder;
  }

  /** What the end-of-run detector reads once the attempt has ended by itself. */
  async #finished(): Promise<FinishedAttempt> {
    // An attempt that threw, was stopped or asked for an OK has no result to
    // ship: it rejects, and the policy counts it as failed.
    await this.#run;
    return {
      steps: this.#recorder.steps(),
      setup: this.#step.writer.setup,
      diff: await (await this.#openedFolder()).diff(),
      seconds: (this.#step.now() - this.#startedAtMs) / 1000,
      exitCode: 0,
      timedOut: false,
      promptChars: this.#step.call.effect.prompt.length,
    };
  }

  /**
   * The attempt's log: each model call's events go to the run's log at
   * once, so the run's budget counts them, and the rest is kept.
   */
  #log(): HarnessEventLog {
    const { log, spend, now } = this.#step;
    return {
      append: async (event) => {
        this.#recorder.record(event as WriterEvent, now());
        if (event.type === "llm.request" || event.type === "llm.response") {
          if (event.type === "llm.response") spend.note(event);
          await log.append(event);
          return;
        }
        this.#kept.push(event);
      },
      settled: () => log.settled(),
      whileHeld: (work) => log.whileHeld(work),
    };
  }

  /** Asks no person: a question stops the attempt before anyone sees it. */
  #approvals(): HarnessApprovals {
    return {
      ask: async ({ tool }) => {
        this.askedForApproval = true;
        const error = new ApprovalRequestedError(
          `Attempt ${this.#number} asked for an OK to run "${tool}", so the early hedge stopped it without asking anyone.`,
        );
        this.#stop.stop(error);
        throw error;
      },
    };
  }
}
