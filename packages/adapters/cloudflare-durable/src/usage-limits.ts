import type {
  UsageAmounts,
  UsageLimits,
  UsagePlan,
  UsageRefusal,
  UsageSummary,
  UsageUnit,
} from "./usage-types.ts";
import { usageUnits } from "./usage-types.ts";

/** Where an account keeps the limits Cloud sent. */
export const usageLimitsKey = "limits";

/** The step's maximum, with the default for each limited unit it gives none for. */
export function withDefaults(max: UsageAmounts, limits: UsageLimits | undefined): UsageAmounts {
  const amounts = { ...max };
  for (const unit of usageUnits) {
    const fallback = limits?.defaultReserve[unit];
    if (
      limits?.limits[unit] !== undefined &&
      amounts[unit] === undefined &&
      fallback !== undefined
    ) {
      amounts[unit] = fallback;
    }
  }
  return amounts;
}

/**
 * The first limited unit that is used up or that `needed` would take past its limit. With
 * `upgradable`, the refusal also says whether a bigger plan raises that unit's limit.
 */
export function firstOver(
  prefix: "plan" | "plan.member",
  limits: UsageAmounts,
  taken: UsageAmounts,
  needed: UsageAmounts,
  resetsAt: number,
  plan?: UsagePlan,
  upgradable?: (unit: UsageUnit) => boolean,
): UsageRefusal | null {
  for (const unit of usageUnits) {
    const limit = limits[unit];
    if (limit === undefined) continue;
    const used = taken[unit] ?? 0;
    const need = needed[unit] ?? 0;
    if (used >= limit || used + need > limit) {
      const left = Math.max(0, limit - used);
      const reached = { unit, used, limit, needed: need, left, resetsAt };
      const named = plan === undefined ? {} : { plan };
      const upgrade = upgradable === undefined ? {} : { canUpgrade: upgradable(unit) };
      return { code: `${prefix}.${unit}`, ...reached, ...named, ...upgrade };
    }
  }
  return null;
}

/**
 * The account menu's figures from the kept limits and the pool's spending this period. A cost
 * limit of 0 counts as used up, so it reads 100 rather than dividing by zero.
 */
export function summaryOf(limits: UsageLimits | undefined, spent: UsageAmounts): UsageSummary {
  if (limits === undefined) return { planName: null, costPercent: null, periodEnd: null };
  const limit = limits.limits.cost;
  const used = spent.cost ?? 0;
  let costPercent: number | null = null;
  if (limit !== undefined) {
    costPercent = limit === 0 ? 100 : Math.min(100, Math.floor((used * 100) / limit));
  }
  return { planName: limits.plan?.name ?? null, costPercent, periodEnd: limits.period.end };
}

/** The 80% and 100% marks the pool has reached this period and not reported yet. */
export function newThresholds(
  limits: UsageAmounts,
  pool: UsageAmounts,
  reported: readonly string[],
): { unit: UsageUnit; percent: 80 | 100; used: number; limit: number }[] {
  const reached = [];
  for (const unit of usageUnits) {
    const limit = limits[unit];
    if (limit === undefined) continue;
    const used = pool[unit] ?? 0;
    for (const percent of [80, 100] as const) {
      if (used * 100 >= limit * percent && !reported.includes(`${unit}:${percent}`)) {
        reached.push({ unit, percent, used, limit });
      }
    }
  }
  return reached;
}
