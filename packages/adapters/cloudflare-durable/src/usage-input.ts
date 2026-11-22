// The account's input rules. Each check throws a RangeError before anything is read or changed,
// and only what passes them is stored, so no free text from a run can reach a usage record.
import { type UsageAmounts, type UsageLimits, type UsageUnit, usageUnits } from "./usage-types.ts";

/** Ids are machine ids: letters, digits and `_ . : -`, at most 128 characters. */
const idPattern = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Ids are keys of plain objects in storage, so an object's own property names can't be ids. */
const reservedIds: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/** A correction's record takes its step's id plus this, so no caller id may end with it. */
export const correctionSuffix = ":late";

/** The kinds of use a caller may record; `step` and `correction` come from reserve and settle. */
const recordKinds: ReadonlySet<string> = new Set(["model_call", "run"]);

/**
 * @throws RangeError when `id` isn't a machine id
 */
export function checkId(name: string, id: string): string {
  if (typeof id !== "string" || !idPattern.test(id) || reservedIds.has(id)) {
    throw new RangeError(`${name} must be 1 to 128 letters, digits or "_.:-".`);
  }
  return id;
}

/**
 * @throws RangeError when one of a step's ids isn't a machine id, or its id ends like a correction's
 */
export function checkIds(ids: { id: string; runId: string; actor: string }): void {
  if (checkId("id", ids.id).endsWith(correctionSuffix)) {
    throw new RangeError(`id can't end with "${correctionSuffix}".`);
  }
  checkId("runId", ids.runId);
  checkId("actor", ids.actor);
}

/**
 * Copies only the known units, each a safe whole number of 0 or more.
 *
 * @throws RangeError when a unit is unknown or its amount isn't a safe whole number of 0 or more
 */
export function checkAmounts(amounts: UsageAmounts): UsageAmounts {
  const checked: UsageAmounts = {};
  for (const [unit, amount] of Object.entries(amounts)) {
    if (!isUnit(unit)) throw new RangeError(`"${unit.slice(0, 32)}" isn't a usage unit.`);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new RangeError(`${unit} must be a safe whole number of 0 or more.`);
    }
    checked[unit] = amount;
  }
  return checked;
}

/**
 * @throws RangeError when a limits document has an amount, a member id or a period that isn't valid
 */
export function checkLimits(limits: UsageLimits): UsageLimits {
  const { version, maxRunning, period } = limits;
  if (![version, maxRunning, period.start, period.end].every(Number.isSafeInteger)) {
    throw new RangeError("A limits document's version, cap and period are safe whole numbers.");
  }
  if (period.end <= period.start) throw new RangeError("A period ends after it starts.");
  checkAmounts(limits.limits);
  checkAmounts(limits.defaultReserve);
  for (const [actor, member] of Object.entries(limits.members ?? {})) {
    checkId("actor", actor);
    checkAmounts(member.shares ?? {});
    if (member.maxRunning !== undefined && !Number.isSafeInteger(member.maxRunning)) {
      throw new RangeError("A member's cap is a safe whole number.");
    }
  }
  return limits;
}

/**
 * @throws RangeError when `kind` isn't one a caller may record
 */
export function checkRecordKind(kind: string): void {
  if (!recordKinds.has(kind))
    throw new RangeError(`"${String(kind).slice(0, 32)}" isn't a record kind.`);
}

/** Whether `unit` is one of the units an account counts. */
export function isUnit(unit: string): unit is UsageUnit {
  return (usageUnits as readonly string[]).includes(unit);
}

/** `a + b` per unit, or `a - b` with a `sign` of -1. */
export function addAmounts(a: UsageAmounts, b: UsageAmounts, sign: 1 | -1 = 1): UsageAmounts {
  const sum: UsageAmounts = { ...a };
  for (const unit of usageUnits) {
    const change = b[unit];
    if (change !== undefined) sum[unit] = (sum[unit] ?? 0) + sign * change;
  }
  return sum;
}
