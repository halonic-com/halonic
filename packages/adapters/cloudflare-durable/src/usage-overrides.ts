// The seller's overrides of a customer's limits. Cloud sends each with its end, and stops sending
// one that ran out only with the customer's next document, which can come late or not at all: so
// the account drops an override by its own clock, at the moment of every check.
import type { UsageAmounts, UsageLimits, UsageOverride, UsageUnit } from "./usage-types.ts";
import { usageUnits } from "./usage-types.ts";

/**
 * The pool's limits at `nowMs`: the plan's, with each override that still applies in the place of
 * its unit's limit. An override of a unit the plan doesn't limit adds no limit and lifts none.
 */
export function effectiveLimits(limits: UsageLimits, nowMs: number): UsageAmounts {
  const effective = { ...limits.limits };
  for (const override of limits.overrides ?? []) {
    if (effective[override.unit] === undefined) continue;
    if (override.until !== null && override.until <= nowMs) continue;
    effective[override.unit] = override.amount;
  }
  return effective;
}

/** Whether a bigger plan raises the limit of `unit`; `false` when the document lists no units. */
export function canUpgrade(limits: UsageLimits, unit: UsageUnit): boolean {
  return limits.upgradable?.includes(unit) ?? false;
}

/**
 * @throws RangeError when an override's unit, amount or end isn't valid, two overrides name one
 * unit, or an upgradable unit isn't a usage unit
 */
export function checkOverrides(limits: UsageLimits): void {
  const { overrides, upgradable } = limits;
  if (overrides !== undefined) {
    if (!Array.isArray(overrides)) throw new RangeError("A document's overrides are a list.");
    const seen = new Set<UsageUnit>();
    for (const override of overrides) {
      checkOverride(override);
      if (seen.has(override.unit)) throw new RangeError("Each unit has at most one override.");
      seen.add(override.unit);
    }
  }
  if (upgradable !== undefined) {
    if (!Array.isArray(upgradable) || !upgradable.every(isUnit)) {
      throw new RangeError("A document's upgradable units are a list of usage units.");
    }
  }
}

function checkOverride(override: UsageOverride): void {
  if (typeof override !== "object" || override === null || !isUnit(override.unit)) {
    throw new RangeError("An override names one of the usage units.");
  }
  if (!isWhole(override.amount)) {
    throw new RangeError("An override's amount is a safe whole number of 0 or more.");
  }
  if (override.until !== null && !isWhole(override.until)) {
    throw new RangeError("An override ends at a time in ms since 1970, or never (null).");
  }
}

function isUnit(unit: unknown): unit is UsageUnit {
  return usageUnits.includes(unit as UsageUnit);
}

function isWhole(amount: unknown): boolean {
  return Number.isSafeInteger(amount) && (amount as number) >= 0;
}
