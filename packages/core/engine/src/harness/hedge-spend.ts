// What the attempts of a hedged writer step share (requirement
// `engine.harness-early-hedge`; Liam on HAL-18801): the run's budget, and the
// cost, tokens and running time its agent's `harnessLimits` allow the step.
// Several attempts draw on them at once, and the Opus fallback gets only
// what is left, so a hedge never lets a step spend more than one run would.
// Turns stay counted per attempt, by each attempt's own `StepLimits`.

import type { Usage } from "@halonicjs/events";
import type { CallBudget } from "../budget/call-budget.ts";
import type { StartLimits } from "./start-limits.ts";
import {
  type HarnessLimitError,
  type HarnessLimits,
  StepLimits,
  type StepNames,
  tokensOf,
} from "./step-limits.ts";

/**
 * The run's budget as the attempts share it: one check at a time, so two
 * attempts never both pass on the same spend, and once it refused a model
 * call it refuses every later one, whichever attempt asks.
 */
export class SerialCallBudget implements CallBudget {
  readonly #budget: CallBudget;
  #queue: Promise<void> = Promise.resolve();
  #refusal: { readonly error: unknown } | undefined;

  constructor(budget: CallBudget) {
    this.#budget = budget;
  }

  keep(): Promise<void> {
    const turn = this.#queue.then(() => this.#keepNow());
    this.#queue = turn.catch(() => {});
    return turn;
  }

  async #keepNow(): Promise<void> {
    if (this.#refusal !== undefined) throw this.#refusal.error;
    try {
      await this.#budget.keep();
    } catch (error) {
      this.#refusal = { error };
      throw error;
    }
  }
}

/**
 * The cost, tokens and running time of a hedged step, counted over all its
 * attempts against the agent's `harnessLimits`. Reaching one stops the whole
 * step through `stopStep`, once.
 */
export class SharedStepSpend {
  readonly #limits: HarnessLimits;
  readonly #shared: StepLimits;
  readonly #now: () => number;
  #cost = 0;
  #tokens = 0;
  #clockStartedAtMs: number | undefined;

  constructor(
    limits: HarnessLimits | undefined,
    names: StepNames,
    stopStep: (error: HarnessLimitError) => void,
    now: () => number,
  ) {
    this.#limits = limits ?? {};
    const { maxSteps: _perAttempt, ...shared } = this.#limits;
    this.#shared = new StepLimits(shared, names, stopStep);
    this.#now = now;
  }

  /**
   * Starts the step's one clock, which runs while any attempt does.
   *
   * @throws when the scheduler doesn't take the timer
   */
  async startClock(limits: StartLimits): Promise<void> {
    this.#clockStartedAtMs = this.#now();
    await this.#shared.startClock(limits);
  }

  async stopClock(): Promise<void> {
    await this.#shared.stopClock();
  }

  /** Adds what one attempt's model call cost and the tokens it used. */
  note(answer: { readonly cost?: number; readonly usage: Usage }): void {
    this.#cost += answer.cost ?? 0;
    this.#tokens += tokensOf(answer.usage);
    this.#shared.afterModelCall(answer);
  }

  /** The agent's limits less what the attempts used, for the fallback. */
  left(): HarnessLimits {
    const { maxCost, maxTokens, maxMinutes } = this.#limits;
    const ranMinutes =
      this.#clockStartedAtMs === undefined ? 0 : (this.#now() - this.#clockStartedAtMs) / 60_000;
    return {
      ...this.#limits,
      ...(maxCost === undefined ? {} : { maxCost: Math.max(0, maxCost - this.#cost) }),
      ...(maxTokens === undefined ? {} : { maxTokens: Math.max(0, maxTokens - this.#tokens) }),
      ...(maxMinutes === undefined ? {} : { maxMinutes: Math.max(0, maxMinutes - ranMinutes) }),
    };
  }
}
