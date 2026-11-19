// Keeps one harness step to the limits its agent's file sets in
// `harnessLimits` (requirement `engine.harness-step-limits`): the model calls
// its program makes, what they cost and how long it runs. A program such as
// Claude Code can run for an hour and make hundreds of model calls, and the
// run's budget only bounds what it costs, never a subscription's calls.

import type { RunFailureCause } from "@halonicjs/events";
import type { Agent } from "@halonicjs/format";
import { KindedError } from "@halonicjs/std";
import type { RunningLimit, StartLimits } from "./start-limits.ts";

/** The limits one harness step keeps to: the agent's `harnessLimits`. */
export type HarnessLimits = NonNullable<Agent["harnessLimits"]>;

/**
 * A harness step stopped because it reached one of its agent's
 * `harnessLimits`. The run records its message as the step's error and
 * its cause, `harness.max-steps`, `harness.max-minutes` or
 * `harness.max-cost` with the limit and what was used, as the typed cause.
 */
export class HarnessLimitError extends KindedError {
  readonly failureCause: Omit<RunFailureCause, "kind">;

  constructor(message: string, code: string, detail: Readonly<Record<string, string>>) {
    super("limit_reached", message);
    this.failureCause = { code, detail };
  }
}

/** Who the step is, as its errors name it. */
export interface StepNames {
  readonly agent: string;
  /** The program, as people read it, such as `Claude Code`. */
  readonly harness: string;
}

/**
 * The use of one harness step against its limits. A limit the agent's file
 * leaves out doesn't apply. Reaching one stops the step through `stopStep`,
 * once: the step then stops its program, as it does for the budget.
 */
export class StepLimits {
  readonly #limits: HarnessLimits;
  readonly #names: StepNames;
  readonly #stopStep: (error: HarnessLimitError) => void;
  #modelCalls = 0;
  #spent = 0;
  #reached: HarnessLimitError | undefined;
  #clock: RunningLimit | undefined;

  constructor(
    limits: HarnessLimits | undefined,
    names: StepNames,
    stopStep: (error: HarnessLimitError) => void,
  ) {
    this.#limits = limits ?? {};
    this.#names = names;
    this.#stopStep = stopStep;
  }

  /**
   * Counts the model call about to go out. Once the step has reached a
   * limit, or the call would go past `maxSteps`, the call is refused and
   * the step stops.
   *
   * @throws HarnessLimitError `limit_reached`, which the bridge answers with 429
   */
  beforeModelCall(): void {
    if (this.#reached !== undefined) throw this.#reached;
    const { maxSteps } = this.#limits;
    if (maxSteps !== undefined && this.#modelCalls >= maxSteps) {
      throw this.#reach(
        `used all ${maxSteps} of its steps (harnessLimits.maxSteps)`,
        "harness.max-steps",
        { limit: String(maxSteps), used: String(maxSteps) },
      );
    }
    this.#modelCalls += 1;
  }

  /**
   * Adds what a model call cost, once its answer is in. When the step has
   * then spent `maxCost` or more, it stops; the call itself is already done.
   *
   * @param cost - the `cost` of its `llm.response`; a call without one, or one a subscription paid, costs 0
   */
  afterModelCall(cost: number | undefined): void {
    this.#spent += cost ?? 0;
    const { maxCost } = this.#limits;
    if (maxCost === undefined || this.#spent < maxCost || this.#reached !== undefined) return;
    this.#reach(
      `spent ${this.#spent.toFixed(2)} of its ${maxCost.toFixed(2)} (harnessLimits.maxCost)`,
      "harness.max-cost",
      { limit: maxCost.toFixed(2), used: this.#spent.toFixed(2) },
    );
  }

  /**
   * Starts counting the step's running time against `maxMinutes`, through
   * the call's limits and so the `Scheduler` port. Without `maxMinutes`,
   * nothing is counted.
   *
   * @throws when the scheduler doesn't take the timer
   */
  async startClock(limits: StartLimits): Promise<void> {
    const { maxMinutes } = this.#limits;
    if (maxMinutes === undefined) return;
    this.#clock = await limits.running(maxMinutes * 60_000, () => {
      this.#reach(
        `ran for its ${maxMinutes} minutes (harnessLimits.maxMinutes)`,
        "harness.max-minutes",
        {
          limit: String(maxMinutes),
          used: String(maxMinutes),
        },
      );
    });
  }

  /** Stops counting the running time while the step waits for a person's answer. */
  async pauseClock(): Promise<void> {
    await this.#clock?.pause();
  }

  /**
   * Counts the running time again, from where it paused.
   *
   * @throws when the scheduler doesn't take the timer
   */
  async resumeClock(): Promise<void> {
    await this.#clock?.resume();
  }

  /** Stops counting for good, as the step ends. */
  async stopClock(): Promise<void> {
    await this.#clock?.end();
  }

  #reach(what: string, code: string, detail: Record<string, string>): HarnessLimitError {
    const error = new HarnessLimitError(
      `Agent "${this.#names.agent}" ${what}, so Halonic stopped ${this.#names.harness}.`,
      code,
      detail,
    );
    this.#reached = error;
    this.#stopStep(error);
    return error;
  }
}
