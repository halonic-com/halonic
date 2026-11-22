// Where the engine asks the meter about its runs (requirement
// `engine.meter-checks`): before a run starts, before a step that asks for a
// paid call, and once a top-level run has ended. A child run counts against
// its top-level run's principal, as it spends from that run's budget.

import type { RunFailureCause } from "@halonicjs/events";
import type { RunStore } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { topRunOf } from "../budget/spend.ts";
import { hasEnded, type RunState } from "../kernel/run-state.ts";
import type { Meter, MeterCheckKind, MeterPrincipal, PlanStop } from "./meter.ts";
import { runEndUsageOf } from "./metered-usage.ts";
import { NoMeter } from "./no-meter.ts";
import { stopOfAnswer } from "./read-answer.ts";

/** What a host gives the engine to meter its runs. */
export interface RunMeter {
  readonly meter: Meter;
  /**
   * The principal a top-level run counts against: the one the host verified
   * when it was asked to start the run, never one the run's input, workflow
   * or steps name. It is asked before the start is recorded, with the id the
   * run will have, so a host that starts runs for many people gives each start
   * its `runId`.
   */
  principalOf(topRunId: string): Promise<MeterPrincipal>;
}

/** The principal of a workspace that sells nothing: its owner, in their own scope. */
export const workspaceOwner: MeterPrincipal = { actor: "u/owner", scope: "u/owner", role: "owner" };

/** The meter of a workspace that sells nothing: `NoMeter`, for its owner. */
export function noRunMeter(): RunMeter {
  return { meter: new NoMeter(), principalOf: async () => workspaceOwner };
}

/** The `limit_reached` error a start the meter refused throws; nothing is recorded for it. */
export class PlanRefusedError extends KindedError {
  /** The meter's typed cause, such as `plan.concurrency` with `running`, `limit` and `cap`. */
  readonly failureCause: RunFailureCause;

  constructor(stop: PlanStop) {
    super("limit_reached", stop.error);
    this.failureCause = stop.cause;
  }
}

/** What `step` asks the meter before a decision that asks for a paid call. */
export interface StepMeter {
  /** The meter's stop for `kind` in `run`, or `null` while it allows it. */
  stopOf(run: RunState, kind: MeterCheckKind): Promise<PlanStop | null>;
}

/** A host's meter, asked about runs in `runs`. */
export class RunsMeter implements StepMeter {
  readonly #meter: RunMeter;
  readonly #runs: Pick<RunStore, "get">;

  constructor(meter: RunMeter, runs: Pick<RunStore, "get">) {
    this.#meter = meter;
    this.#runs = runs;
  }

  async stopOf(run: RunState, kind: MeterCheckKind): Promise<PlanStop | null> {
    const principal = await this.#meter.principalOf(await topRunOf(this.#runs, run));
    return stopOfAnswer(await this.#meter.meter.check(principal, { kind }));
  }

  /**
   * Lets a top-level run start, or refuses it, such as with `plan.concurrency`.
   *
   * @throws PlanRefusedError when the meter doesn't allow the start
   */
  async mayStart(runId: string): Promise<void> {
    const principal = await this.#meter.principalOf(runId);
    const stop = stopOfAnswer(await this.#meter.meter.check(principal, { kind: "run-start" }));
    if (stop !== null) throw new PlanRefusedError(stop);
  }

  /** Counts the end of a run a step has just ended, when it is a top-level run. */
  async ended(run: RunState): Promise<void> {
    if (run.parent !== null || !hasEnded(run.status)) return;
    const principal = await this.#meter.principalOf(run.runId);
    await this.#meter.meter.record(principal, runEndUsageOf(run));
  }
}
