// The account's input rules. Each check throws a RangeError before anything is read or changed,
// and only what passes them is stored, so no free text from a run can reach a usage record.
import {
  maxPlanNameLength,
  type UsageAmounts,
  type UsageLimits,
  type UsagePlan,
  type UsageUnit,
  usageUnits,
} from "./usage-types.ts";

/** Ids are machine ids: letters, digits and `_ . : -`, at most 128 characters. */
const idPattern = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Ids are keys of plain objects in storage, so an object's own property names can't be ids. */
const reservedIds: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/** A correction's record takes its step's id plus this, so no caller id may end with it. */
export const correctionSuffix = ":late";

/** The kinds of use a caller may record; `step` and `correction` come from reserve and settle. */
const recordKinds: ReadonlySet<string> = new Set(["model_call", "run"]);

/** A scope is a person's (`u/<id>`) or an organisation's (`o/<id>`), as the Meter port names it. */
const scopePattern = /^[uo]\/[A-Za-z0-9_.:-]{1,126}$/;

/**
 * @throws RangeError when `scope` isn't `u/` or `o/` followed by a machine id
 */
export function checkScope(scope: string): string {
  if (typeof scope !== "string" || !scopePattern.test(scope)) {
    throw new RangeError(
      'scope must be "u/" or "o/" followed by 1 to 126 letters, digits or "_.:-".',
    );
  }
  return scope;
}

/**
 * @throws RangeError when `id` isn't a machine id
 */
export function checkId(name: string, id: string): string {
  if (typeof id !== "string" || !idPattern.test(id) || reservedIds.has(id)) {
    throw new RangeError(`${name} must be 1 to 128 letters, digits or "_.:-".`);
  }
  return id;
}

/** A step's or a record's id leaves room for {@link correctionSuffix} within the 128 characters. */
const maxChargeIdLength = 128 - correctionSuffix.length;

/** A model as `<provider>/<model>`: a machine id with one `/`, at most 128 characters. */
const modelPattern = /^[A-Za-z0-9_.:-]+\/[A-Za-z0-9_.:-]+$/;

/**
 * The model a call record names, or `undefined` when there is none or it isn't a model id. It never
 * throws: a call is still charged without its model, and Cloud holds it unpriced.
 */
export function modelOrNone(model: string | undefined): string | undefined {
  const fits = typeof model === "string" && model.length <= 128 && modelPattern.test(model);
  return fits ? model : undefined;
}

/**
 * @throws RangeError when one of a step's ids isn't a machine id, or its id ends like a
 * correction's or leaves no room for one
 */
export function checkIds(ids: { id: string; runId: string; actor: string }): void {
  const id = checkId("id", ids.id);
  if (id.endsWith(correctionSuffix) || id.length > maxChargeIdLength) {
    throw new RangeError(
      `id is at most ${maxChargeIdLength} characters and can't end with "${correctionSuffix}".`,
    );
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
 * @throws RangeError when a limits document has an amount, a member id, a period or a plan that
 * isn't valid
 */
export function checkLimits(limits: UsageLimits): UsageLimits {
  const { version, maxRunning, period } = limits;
  if (!isObject(period) || !isObject(limits.limits) || !isObject(limits.defaultReserve)) {
    throw new RangeError("A limits document has a period, limits and a default reserve.");
  }
  if (![version, period.start, period.end].every(Number.isSafeInteger) || !isCap(maxRunning)) {
    throw new RangeError("A limits document's version, cap and period are safe whole numbers.");
  }
  if (period.end <= period.start) throw new RangeError("A period ends after it starts.");
  checkAmounts(limits.limits);
  checkAmounts(limits.defaultReserve);
  if (limits.plan !== undefined) checkPlan(limits.plan);
  for (const [actor, member] of Object.entries(limits.members ?? {})) {
    checkId("actor", actor);
    checkAmounts(member.shares ?? {});
    if (member.maxRunning !== undefined && !isCap(member.maxRunning)) {
      throw new RangeError("A member's cap is a safe whole number of 0 or more.");
    }
  }
  return limits;
}

/**
 * A plan is a machine id, a version of 0 or more and a name to show: at most 200 characters, not
 * only blanks, and no control or format characters, since it reaches a stop's detail and the
 * account menu as it is.
 */
function checkPlan(plan: UsagePlan): void {
  if (!isObject(plan)) {
    throw new RangeError("A limits document's plan has an id, version and name.");
  }
  checkId("plan.id", plan.id);
  if (!isCap(plan.version)) {
    throw new RangeError("A plan's version is a safe whole number of 0 or more.");
  }
  const { name } = plan;
  const fits =
    typeof name === "string" &&
    name.trim() !== "" &&
    name.length <= maxPlanNameLength &&
    !/[\p{Cc}\p{Cf}]/u.test(name);
  if (!fits) {
    throw new RangeError(
      `A plan's name is 1 to ${maxPlanNameLength} characters with no control characters.`,
    );
  }
}

function isCap(cap: number): boolean {
  return Number.isSafeInteger(cap) && cap >= 0;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
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
