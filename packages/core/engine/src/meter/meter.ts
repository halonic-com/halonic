// The port the engine counts usage through and asks before it spends
// (requirement `engine.meter-port`): what a deployment that sells runs keeps
// per customer, with the limits it refuses at. The engine asks it at the
// points where it keeps to the budget (`engine.budget-stops`).
//
// The meter only takes usage this package makes: a model call's from its
// logged `llm.response`, a step's times from the engine's clock. A step or a
// container can't tell the meter what it used, because only the engine calls
// `record` and `settle`. The usage types also carry a mark a plain object
// lacks, so passing one by mistake doesn't typecheck (a cast still could).

import type { RunStatus, Usage } from "@halonicjs/events";
import type { BudgetStop } from "../budget/budget.ts";

/** Who usage counts against: the person signed in, the scope they work in, and their role there. */
export interface MeterPrincipal {
  /** The signed-in end user; always a person. */
  readonly actor: string;
  /** The scope usage counts in: `u/<id>` for a person's own, `o/<id>` for an organisation. */
  readonly scope: string;
  /** `owner` in a personal scope; the member's role in an organisation. */
  readonly role: "owner" | "admin" | "member";
}

/**
 * What the engine is about to do when it asks {@link Meter.check}.
 *
 * For `run-start`, the meter counts the runs going on (for a cap such as
 * `plan.concurrency`) from its own view of the runs, never from these checks:
 * `check` records nothing, and a start that `check` allowed can still fail
 * before it is recorded, and then no end of it is ever recorded.
 */
export type MeterCheckKind = "run-start" | "model-call" | "harness-run";

/** The most a harness step may use, from its agent's `harnessLimits`; a limit the agent leaves out is absent. */
export interface MeterMaximum {
  /** In the budget's currency. */
  readonly cost?: number;
  readonly minutes?: number;
  /** Model calls. */
  readonly steps?: number;
}

/** Why the meter refuses: the run's error and its `limit_reached` cause, as a budget stop has. */
export type PlanStop = BudgetStop;

/** Use the meter allowed and holds back until it is settled. */
export interface Reservation {
  /** The meter's own id for it. */
  readonly id: string;
  readonly principal: MeterPrincipal;
}

declare const madeByEngine: unique symbol;

/** The mark of a value only this package makes. */
interface MadeByEngine {
  readonly [madeByEngine]: true;
}

/** One model call, counted as a run's summary counts it (`events.summary-cost`). */
export type ModelCallUsage = MadeByEngine & {
  readonly kind: "model_call";
  readonly runId: string;
  /**
   * `<runId>:<seq>` of the call's logged `llm.response`. The same call always
   * gets the same id, so a meter that keeps the ids it has recorded counts a
   * call recorded twice once.
   */
  readonly callId: string;
  /**
   * The model that answered, as `<provider>/<model>` (`anthropic/claude-opus-5-5`), so a meter
   * can price the call from its own table instead of trusting `cost`.
   */
  readonly model: string;
  /** `null` for an answer from the cache, which called no model. */
  readonly usage: Usage | null;
  /** In the budget's currency; 0 for a call a subscription paid, an unpriced one and a cached one. */
  readonly cost: number;
  readonly counted: "priced" | "unpriced" | "subscription" | "cached";
};

/** A run that ended. */
export type RunEndUsage = MadeByEngine & {
  readonly kind: "run";
  readonly runId: string;
  readonly status: RunStatus;
};

/** What {@link Meter.record} counts. */
export type MeterUsage = ModelCallUsage | RunEndUsage;

/** How long a harness step took, by the engine's clock. */
export type StepTimes = MadeByEngine & {
  /** From the step's start to its end. */
  readonly wallMs: number;
  /** From the harness program's start to the step's end; 0 when the program never started. */
  readonly harnessMs: number;
};

/** The meter's answer to a check. Anything but `allowed: true` refuses. */
export type MeterAnswer =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly stop: PlanStop };

/** The meter's answer to a reservation. Anything but `allowed: true` refuses. */
export type ReserveAnswer =
  | { readonly allowed: true; readonly reservation: Reservation }
  | { readonly allowed: false; readonly stop: PlanStop };

/**
 * Counts what each principal uses and refuses at their limits. The principal
 * always comes from the host, which verified it; never from a run's input, its
 * workflow or a step.
 */
export interface Meter {
  /** Whether the principal may do `kind` now. Records nothing. */
  check(
    principal: MeterPrincipal,
    request: { readonly kind: MeterCheckKind },
  ): Promise<MeterAnswer>;
  /**
   * Holds back the most a harness step may use, or refuses when that would go
   * past a limit, so a step that can't finish within it never starts.
   *
   * Each unit `maximum` gives is one the engine stops the step at. A unit it
   * leaves out has no maximum of the step's own: the meter holds back its own
   * default, which the engine then keeps the step to. `0` means none of it.
   * Cost is known only once a model call has answered, so a step can end past
   * its cost maximum by its last call; the meter charges at most what it held
   * back and keeps the rest apart.
   */
  reserve(principal: MeterPrincipal, maximum: MeterMaximum): Promise<ReserveAnswer>;
  /** Records a finished step's times and lets go of what it held back and didn't use. */
  settle(reservation: Reservation, times: StepTimes): Promise<void>;
  /** Records a model call, or the end of a run. */
  record(principal: MeterPrincipal, usage: MeterUsage): Promise<void>;
}
