// The stops a meter answers with (requirement `engine.plan-stops`): a
// `limit_reached` cause whose code starts with `plan.`, next to the seller's
// `budget.run` and `budget.month`. A screen words each one from its code and
// detail. A cause's detail holds strings only, so the plan's fields are flat.

import type { RunFailureCause } from "@halonicjs/events";
import type { PlanStop } from "./meter.ts";

/** The customer's plan, as a stop names it. */
export interface StopPlan {
  readonly id: string;
  readonly version: number;
  readonly name: string;
}

/** A unit's limit that was reached, in the unit's base form: cost in the budget's currency, minutes as a number. */
export interface ReachedLimit {
  /** Such as `cost` or `harnessMinutes`. */
  readonly unit: string;
  readonly used: number;
  readonly limit: number;
  /** Set for `cost`. */
  readonly currency?: string;
  /** When the period ends and the use starts again from 0 (ISO). */
  readonly resetsAt: string;
  readonly plan: StopPlan;
  /** Whether the product has a published plan with a higher limit for the unit. */
  readonly canUpgrade: boolean;
  /** Set when a reservation was refused: what the step needed, and what was left. */
  readonly reserve?: { readonly needed: number; readonly left: number };
}

/** Words that can't be a unit, because codes of their own start with them. */
const notUnits: ReadonlySet<string> = new Set(["concurrency", "none", "suspended", "member"]);

/**
 * The stop for a unit's limit in the principal's scope: code `plan.<unit>`.
 *
 * @throws RangeError when `unit` isn't a word, or is one of the other codes' words
 */
export function planLimitStop(reached: ReachedLimit): PlanStop {
  const error =
    reached.reserve === undefined
      ? `Plan limit reached: ${reached.used} of ${reached.limit} ${unitWords(reached)} used.`
      : `Plan limit reached: the step needs up to ${reached.reserve.needed} ${unitWords(reached)}, and ${reached.reserve.left} is left.`;
  return planStop(`plan.${checkedUnit(reached.unit)}`, error, reachedDetail(reached));
}

/**
 * The stop for a member's share of an organisation's unit: code
 * `plan.member.<unit>`. A member can't change the organisation's plan, so
 * `canUpgrade` is always `false`.
 *
 * @throws RangeError when `unit` isn't a word, or is one of the other codes' words
 */
export function memberLimitStop(reached: Omit<ReachedLimit, "canUpgrade">): PlanStop {
  const detail = reachedDetail({ ...reached, canUpgrade: false });
  const error =
    reached.reserve === undefined
      ? `Your share of this organisation's ${unitWords(reached)} is used: ${reached.used} of ${reached.limit}.`
      : `Your share of this organisation's ${unitWords(reached)} is too small: the step needs up to ${reached.reserve.needed}, and ${reached.reserve.left} is left.`;
  return planStop(`plan.member.${checkedUnit(reached.unit)}`, error, detail);
}

/** The stop for starting a run while as many run as the scope's or the member's cap allows: code `plan.concurrency`. */
export function concurrencyStop(running: number, limit: number, cap: "scope" | "member"): PlanStop {
  const error = `Too many runs at once: ${running} of ${limit} are running.`;
  return planStop("plan.concurrency", error, {
    running: String(running),
    limit: String(limit),
    cap,
  });
}

/** The stop when the meter knows no limits for the scope: code `plan.none`. No limits never means no limit. */
export function noPlanStop(): PlanStop {
  return planStop("plan.none", "No plan is set up for this account, so nothing can run.");
}

/** The stop for a customer who isn't active: code `plan.suspended`. */
export function suspendedStop(): PlanStop {
  return planStop("plan.suspended", "This account isn't active, so nothing can run.");
}

/** The stop for someone no longer a member of the organisation: code `plan.member-removed`. */
export function memberRemovedStop(): PlanStop {
  return planStop(
    "plan.member-removed",
    "You're no longer a member of this organisation, so nothing can run in it.",
  );
}

/**
 * Whether a cause is a meter's stop. The seller's `budget.run` and
 * `budget.month` and a step's own `harness.max-*` limits are not, and stay
 * final whatever a customer's plan allows.
 */
export function isPlanStop(cause: RunFailureCause | undefined): boolean {
  return cause?.kind === "limit_reached" && cause.code?.startsWith("plan.") === true;
}

/**
 * Whether a cause is the stop for a unit's limit, `plan.<unit>` or
 * `plan.member.<unit>`, which a run waits at (requirement
 * `engine.plan-limit-wait`). `plan.none`, `plan.suspended`,
 * `plan.member-removed` and `plan.concurrency` are not.
 */
export function isUnitLimitStop(cause: RunFailureCause): boolean {
  if (cause.kind !== "limit_reached" || cause.code === undefined) return false;
  const unit = /^plan\.(?:member\.)?(.*)$/.exec(cause.code)?.[1];
  return unit !== undefined && isUnit(unit);
}

function planStop(
  code: string,
  error: string,
  detail?: Readonly<Record<string, string>>,
): PlanStop {
  return {
    error,
    cause: { kind: "limit_reached", code, ...(detail === undefined ? {} : { detail }) },
  };
}

function reachedDetail(reached: ReachedLimit): Readonly<Record<string, string>> {
  return {
    unit: reached.unit,
    used: String(reached.used),
    limit: String(reached.limit),
    ...(reached.currency === undefined ? {} : { currency: reached.currency }),
    resetsAt: reached.resetsAt,
    planId: reached.plan.id,
    planVersion: String(reached.plan.version),
    planName: reached.plan.name,
    canUpgrade: String(reached.canUpgrade),
    ...(reached.reserve === undefined
      ? {}
      : {
          phase: "reserve",
          needed: String(reached.reserve.needed),
          left: String(reached.reserve.left),
        }),
  };
}

/** The unit as the error names it: its currency for cost. */
function unitWords(reached: Pick<ReachedLimit, "unit" | "currency">): string {
  return reached.currency ?? reached.unit;
}

function isUnit(unit: string): boolean {
  return /^[a-z][A-Za-z]*$/.test(unit) && !notUnits.has(unit);
}

function checkedUnit(unit: string): string {
  if (!isUnit(unit)) {
    throw new RangeError(
      `"${unit}" can't be a plan's unit: a unit is one word, such as cost or harnessMinutes.`,
    );
  }
  return unit;
}
