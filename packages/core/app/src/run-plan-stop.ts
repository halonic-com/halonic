// A meter's plan stop, read from its cause's code and detail (requirement
// `app.run-plan-stop`), so a screen words it the same way for every product.
// The cause's detail holds strings only (requirement `engine.plan-stops`).
// The cost unit is the seller's model cost, which a customer never reads as
// money (flows, section 0), so its facts carry percentages only.

import type { RunFailureCause, RunSummary } from "@halonicjs/events";

/** A refused reservation: how much the step needed and how much was left. */
export interface PlanReserve {
  /** What the step needed, as a whole percent of the limit, rounded up ("up to"). */
  readonly neededPercent: number;
  /** What was left, as a whole percent of the limit, rounded down. */
  readonly leftPercent: number;
  /** The amounts themselves, in the unit; absent for `cost`. */
  readonly needed?: number;
  readonly left?: number;
}

/** A unit's limit reached: `plan.<unit>`, or `plan.member.<unit>` for a member's share. */
export interface PlanUnitStop {
  readonly kind: "unit";
  /** Such as `cost` or `harnessMinutes`. */
  readonly unit: string;
  /** Whether it is a member's share of an organisation's unit. */
  readonly member: boolean;
  /** What was used, as a whole percent of the limit, rounded down and at most 100. */
  readonly usedPercent: number;
  /** The amounts themselves, in the unit; absent for `cost`. */
  readonly used?: number;
  readonly limit?: number;
  /** When the use starts again from 0 (ISO), when the stop says. */
  readonly resetsAt?: string;
  /** The plan's name, when the stop says. */
  readonly planName?: string;
  /** Whether a bigger plan raises this limit; never for a member's share. */
  readonly canUpgrade: boolean;
  /** Set when the reservation before a step was refused. */
  readonly reserve?: PlanReserve;
}

/** Too many runs at once: `plan.concurrency`, refused before the run started. */
export interface PlanConcurrencyStop {
  readonly kind: "concurrency";
  readonly running: number;
  readonly limit: number;
  /** Whose cap was hit: the customer's (`scope`) or a member's share (`member`). */
  readonly cap: "scope" | "member";
}

/** The facts of a meter's plan stop, by its code. */
export type PlanStop =
  | PlanUnitStop
  | PlanConcurrencyStop
  | { readonly kind: "none" }
  | { readonly kind: "suspended" }
  | { readonly kind: "member-removed" };

/** Where a run stands at a plan stop. */
export type PlanRun =
  /** It waits for `continue`, and fails at `until` (ISO) if nobody continues it. */
  | { readonly state: "waiting"; readonly stop: PlanUnitStop; readonly until: string }
  /** Nobody continued it, so it failed when its wait ended. */
  | { readonly state: "stopped-for-good"; readonly stop: PlanUnitStop }
  /** It failed at the stop without waiting. */
  | { readonly state: "stopped"; readonly stop: PlanStop };

/** The codes whose stop has no detail. */
const plainStops: Readonly<Record<string, PlanStop>> = {
  "plan.none": { kind: "none" },
  "plan.suspended": { kind: "suspended" },
  "plan.member-removed": { kind: "member-removed" },
};

/**
 * The facts of a meter's plan stop.
 *
 * @returns `undefined` when the cause isn't a `limit_reached` with a `plan.`
 * code this reads, or its detail lacks a figure the code needs
 */
export function planStopOf(cause: RunFailureCause | undefined): PlanStop | undefined {
  if (cause?.kind !== "limit_reached" || cause.code === undefined) return undefined;
  const plain = plainStops[cause.code];
  if (plain !== undefined) return plain;
  const detail = cause.detail ?? {};
  if (cause.code === "plan.concurrency") return concurrencyStopOf(detail);
  const unitCode = /^plan\.(member\.)?([A-Za-z]+)$/.exec(cause.code);
  if (unitCode === null) return undefined;
  const [, member, unit] = unitCode;
  const { unit: detailUnit } = detail;
  if (unit === undefined || unit !== detailUnit) return undefined;
  return unitStopOf(unit, member !== undefined, detail);
}

/**
 * Where a run stands at a plan stop, from its summary: waiting at a unit's
 * limit, failed after nobody continued it, or failed at a stop straight away.
 * A `continue` clears the summary's `nextTimer`, so a run that failed at or
 * after its wait's end failed because the wait ended.
 *
 * @returns `undefined` when the run isn't at a plan stop this reads
 */
export function planRunOf(summary: RunSummary): PlanRun | undefined {
  if (summary.status === "waiting") {
    const stop = planStopOf(summary.limit);
    if (stop?.kind !== "unit" || summary.nextTimer === null) return undefined;
    return { state: "waiting", stop, until: summary.nextTimer };
  }
  if (summary.status !== "failed" || summary.reason !== "budget") return undefined;
  const stop = planStopOf(summary.cause);
  if (stop === undefined) return undefined;
  const { nextTimer, endedAt } = summary;
  const waitEnded = nextTimer !== null && endedAt !== null && endedAt >= nextTimer;
  return stop.kind === "unit" && waitEnded
    ? { state: "stopped-for-good", stop }
    : { state: "stopped", stop };
}

/** A `plan.concurrency` stop's figures; `undefined` when one is missing. */
function concurrencyStopOf(detail: Readonly<Record<string, string>>): PlanStop | undefined {
  const { cap } = detail;
  const running = wholeNumber(detail["running"]);
  const limit = wholeNumber(detail["limit"]);
  if (running === undefined || limit === undefined) return undefined;
  if (cap !== "scope" && cap !== "member") return undefined;
  return { kind: "concurrency", running, limit, cap };
}

/** A unit's stop; `undefined` when its used or limit figure is missing. */
function unitStopOf(
  unit: string,
  member: boolean,
  detail: Readonly<Record<string, string>>,
): PlanUnitStop | undefined {
  const { resetsAt, planName, canUpgrade } = detail;
  const used = amount(detail["used"]);
  const limit = amount(detail["limit"]);
  if (used === undefined || limit === undefined) return undefined;
  const isCost = unit === "cost";
  const reserve = reserveOf(detail, limit, isCost);
  return {
    kind: "unit",
    unit,
    member,
    usedPercent: Math.min(100, Math.floor(percentOf(used, limit))),
    ...(isCost ? {} : { used, limit }),
    ...(resetsAt === undefined ? {} : { resetsAt }),
    ...(planName === undefined ? {} : { planName }),
    canUpgrade: !member && canUpgrade === "true",
    ...(reserve === undefined ? {} : { reserve }),
  };
}

/** A refused reservation's figures, when the stop has `phase: "reserve"` and both of them. */
function reserveOf(
  detail: Readonly<Record<string, string>>,
  limit: number,
  isCost: boolean,
): PlanReserve | undefined {
  const { phase } = detail;
  if (phase !== "reserve") return undefined;
  const needed = amount(detail["needed"]);
  const left = amount(detail["left"]);
  if (needed === undefined || left === undefined) return undefined;
  return {
    neededPercent: Math.ceil(percentOf(needed, limit)),
    leftPercent: Math.max(0, Math.floor(percentOf(left, limit))),
    ...(isCost ? {} : { needed, left }),
  };
}

/**
 * `part` as a percent of `limit`; a limit of 0 is all used. It is kept to six
 * decimals, so floating point can't round 9.7 of 10 down to 96%.
 */
function percentOf(part: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.round((part * 100 * 1e6) / limit) / 1e6;
}

/** A detail's figure, at least 0; `undefined` when it isn't a number. */
function amount(text: string | undefined): number | undefined {
  if (text === undefined || text.trim() === "") return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** A detail's whole number, at least 0; `undefined` otherwise. */
function wholeNumber(text: string | undefined): number | undefined {
  const value = amount(text);
  return value !== undefined && Number.isInteger(value) ? value : undefined;
}
