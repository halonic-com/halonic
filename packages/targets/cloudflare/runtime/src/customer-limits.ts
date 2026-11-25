// Cloud's `limits.customer` document (`control-plane.limits-documents`) as the usage object keeps
// it. Every value is checked against the few Cloud may send, and anything else refuses the whole
// document: a value the reader skipped would leave a limit out, and a missing limit is no limit.
import {
  checkLimits,
  type UsageLimits,
  type UsageOverride,
  type UsageUnit,
} from "@halonicjs/adapter-cloudflare-durable";
import { isPlainObject } from "@halonicjs/std";
import { scaledDecimal } from "./decimal-amount.ts";

/** Why a customer document was refused; the route logs it and answers that it isn't valid. */
export class CustomerLimitsError extends RangeError {
  override readonly name = "RangeError";
}

/** Cloud's units, each with the object's unit and how many decimals the object can hold exactly. */
const units: Readonly<Record<string, { unit: UsageUnit; decimals: number; times: number }>> = {
  runs: { unit: "runs", decimals: 0, times: 1 },
  steps: { unit: "steps", decimals: 0, times: 1 },
  tokens: { unit: "tokens", decimals: 0, times: 1 },
  // Cost in millionths of the currency.
  cost: { unit: "cost", decimals: 6, times: 1 },
  // Minutes in ms: four decimals of a minute times 6 is a whole ms.
  harnessMinutes: { unit: "harnessMs", decimals: 4, times: 6 },
};

/**
 * A plan's limits count per subscription period, the only period the usage object counts: a limit
 * per `day`, `run` or `step`, or one that only `notify`s, can't be kept, so it refuses the document.
 */
const countedPeriod = "month";
const stopAction = "stop";

const customerStatuses = ["active", "suspended", "deleted"];
const planStates = ["active", "trialing", "past_due"];

/** A customer without a plan has no period; their document stands until Cloud sends a newer one. */
const noPeriod = { start: 0, end: Number.MAX_SAFE_INTEGER };

/** Cloud's customer document carries no cap on running runs: the product document sets it. */
export const noRunCap = Number.MAX_SAFE_INTEGER;

const isoTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

function refuse(reason: string): never {
  throw new CustomerLimitsError(reason);
}

/**
 * The usage object's document for `scope` from Cloud's `limits.customer` payload. The customer
 * must be the scope's own (`u/<endUserId>`). A customer who isn't `active` keeps refusing as
 * stopped; a plan `none` refuses as no plan; the plan's state is otherwise kept as Cloud sent it,
 * with no grace of its own. `product` is information only and isn't read, and a field the format
 * doesn't have is never read either, so a product-wide value can't arrive this way.
 *
 * @throws CustomerLimitsError (a RangeError) when any value isn't one Cloud may send
 */
export function customerLimitsOf(payload: unknown, scope: string): UsageLimits {
  if (!isPlainObject(payload)) refuse("The document isn't an object.");
  const { endUserId, version, customer, plan, limits, overrides } = payload;
  if (typeof endUserId !== "string" || `u/${endUserId}` !== scope) {
    refuse("The document is for another customer.");
  }
  if (!isWhole(version)) refuse("The version isn't a whole number.");
  if (!customerStatuses.includes(customer as string)) refuse("The customer's status is unknown.");
  const read = readPlan(plan);
  const currency = new CurrencyCheck();
  const planLimits = readLimits(limits, currency);
  if (read.state === "none" && planLimits.amounts.size > 0) refuse("A plan none has no limits.");
  return checkedByTheObject({
    version,
    status: statusOf(customer as string, read.state),
    period: read.period,
    limits: Object.fromEntries(planLimits.amounts),
    defaultReserve: {},
    maxRunning: noRunCap,
    ...(read.plan === undefined ? {} : { plan: read.plan }),
    overrides: readOverrides(overrides, currency),
    upgradable: planLimits.upgradable,
  });
}

/** The usage object's own checks (the plan's id and name among them), run before it is reached. */
function checkedByTheObject(limits: UsageLimits): UsageLimits {
  try {
    return checkLimits(limits);
  } catch (error) {
    if (error instanceof RangeError) refuse(error.message);
    throw error;
  }
}

function statusOf(customer: string, planState: string): UsageLimits["status"] {
  if (customer !== "active") return "stopped";
  return planState === "none" ? "none" : "active";
}

interface ReadPlan {
  readonly state: string;
  readonly period: UsageLimits["period"];
  readonly plan?: NonNullable<UsageLimits["plan"]>;
}

function readPlan(plan: unknown): ReadPlan {
  if (!isPlainObject(plan)) refuse("The plan isn't an object.");
  if (plan["state"] === "none") return { state: "none", period: noPeriod };
  const { state, id, version, name, periodStart, periodEnd } = plan;
  if (!planStates.includes(state as string)) refuse("The plan's state is unknown.");
  const start = isoTime(periodStart);
  const end = isoTime(periodEnd);
  // The id, version and name are checked with the rest of the document (`checkedByTheObject`).
  const kept = { id, version, name } as NonNullable<UsageLimits["plan"]>;
  return { state: state as string, period: { start, end }, plan: kept };
}

interface ReadLimits {
  readonly amounts: Map<UsageUnit, number>;
  readonly upgradable: UsageUnit[];
}

function readLimits(limits: unknown, currency: CurrencyCheck): ReadLimits {
  if (!Array.isArray(limits)) refuse("The limits aren't a list.");
  const read: ReadLimits = { amounts: new Map(), upgradable: [] };
  for (const limit of limits) {
    if (!isPlainObject(limit)) refuse("A limit isn't an object.");
    if (limit["period"] !== countedPeriod) refuse("A limit's period can't be counted here.");
    if (limit["action"] !== stopAction) refuse("A limit's action can't be kept here.");
    if (typeof limit["canUpgrade"] !== "boolean")
      refuse("A limit's upgrade offer isn't a boolean.");
    const { unit, amount } = readAmount(limit, currency);
    if (read.amounts.has(unit)) refuse("Two limits name one unit and period.");
    read.amounts.set(unit, amount);
    if (limit["canUpgrade"]) read.upgradable.push(unit);
  }
  return read;
}

function readOverrides(overrides: unknown, currency: CurrencyCheck): UsageOverride[] {
  if (!Array.isArray(overrides)) refuse("The overrides aren't a list.");
  return overrides.map((override: unknown) => {
    if (!isPlainObject(override)) refuse("An override isn't an object.");
    const { unit, amount } = readAmount(override, currency);
    const until = override["until"] === null ? null : isoTime(override["until"]);
    return { unit, amount, until };
  });
}

/** A limit's or an override's unit and amount, in the object's unit and smallest step. */
function readAmount(entry: Record<string, unknown>, currency: CurrencyCheck) {
  const known = Object.hasOwn(units, entry["unit"] as string)
    ? units[entry["unit"] as string]
    : undefined;
  if (known === undefined) refuse("A unit is unknown.");
  currency.check(known.unit, entry["currency"]);
  const scaled = scaledDecimal(entry["amount"], known.decimals);
  if (scaled === null) refuse("An amount isn't a decimal the unit can hold exactly.");
  const amount = scaled * known.times;
  if (!Number.isSafeInteger(amount)) refuse("An amount is too large.");
  return { unit: known.unit, amount };
}

/** Every cost amount names one currency; every other amount names none. */
class CurrencyCheck {
  #currency: string | undefined;

  check(unit: UsageUnit, currency: unknown): void {
    if (unit !== "cost") {
      if (currency !== null) refuse("Only a cost amount has a currency.");
      return;
    }
    if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
      refuse("A cost amount has a three-letter currency.");
    }
    this.#currency ??= currency;
    if (currency !== this.#currency) refuse("The cost amounts name different currencies.");
  }
}

function isoTime(text: unknown): number {
  const time =
    typeof text === "string" && isoTimePattern.test(text) ? Date.parse(text) : Number.NaN;
  if (Number.isNaN(time)) refuse("A time isn't an ISO time.");
  return time;
}

function isWhole(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
