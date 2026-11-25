import { type CostPeriod, costPeriodStart } from "./cost-period.ts";

/**
 * What one run cost. Money is kept in whole minor units (cents for EUR and
 * USD), so adding thousands of runs never drifts the way floats do. An agent
 * on a subscription has no price per run, so it reports tokens instead.
 */
export type RunCost =
  | { readonly kind: "money"; readonly currency: string; readonly minorUnits: number }
  | { readonly kind: "tokens"; readonly tokens: number }
  | { readonly kind: "none" };

/** One run as the Costs view counts it: where it ran, what ran, when it started and what it cost. */
export interface CostEntry {
  /** The workspace or Paperclip team the run belongs to. */
  readonly source: { readonly id: string; readonly name: string };
  /** The workflow or agent that ran. */
  readonly subject: { readonly id: string; readonly name: string };
  /** When the run started; a run counts in the day it started, even if it ended after midnight. */
  readonly startedAt: Date;
  /** Whether the run is still going, so its cost is only "so far". */
  readonly running: boolean;
  /** What it cost, or has cost so far. */
  readonly cost: RunCost;
}

/** A sum of money in one currency, in whole minor units. */
export interface MoneyTotal {
  /** An ISO 4217 code, such as "EUR". */
  readonly currency: string;
  /** The sum, in whole minor units. */
  readonly minorUnits: number;
}

/** The totals for one workflow, agent, workspace or team. */
export interface CostTotal {
  /** The id of what is totalled. */
  readonly id: string;
  /** Its name, for the row. */
  readonly name: string;
  /** One total per currency, sorted by currency code; different currencies are never added together. */
  readonly money: readonly MoneyTotal[];
  /** Tokens used by runs that report tokens instead of money. */
  readonly tokens: number;
  /** How many runs it holds. */
  readonly runs: number;
  /** Whether a run in it is still going, so the totals are "so far". */
  readonly soFar: boolean;
}

/** The totals for one workspace or team, with each workflow or agent under it. */
export interface SourceCostTotal extends CostTotal {
  /** One total per workflow or agent, sorted by name. */
  readonly subjects: readonly CostTotal[];
}

/** Everything the Costs view shows for one period. */
export interface CostTotals {
  /** The period asked for. */
  readonly period: CostPeriod;
  /** The first instant inside it. */
  readonly startsAt: Date;
  /** One total per workspace or team, sorted by name. */
  readonly sources: readonly SourceCostTotal[];
}

/** What the Costs view needs to total a period: the time and zone come in, never from the machine. */
export interface CostTotalsInput {
  /** Every run that may fall in the period. */
  readonly entries: readonly CostEntry[];
  /** The period to total. */
  readonly period: CostPeriod;
  /** The current time. */
  readonly now: Date;
  /** The user's IANA time zone. */
  readonly timeZone: string;
}

/**
 * Totals the runs that started inside a period, per workspace or team and
 * then per workflow or agent. Runs that started after `now` are left out.
 *
 * @param input - the runs, the period, the current time and the time zone
 * @returns the totals, sorted by name at both levels
 * @throws RangeError when a money cost isn't a whole number of minor units, or tokens aren't whole
 */
export function costTotals(input: CostTotalsInput): CostTotals {
  const startsAt = costPeriodStart(input.period, input.now, input.timeZone);
  const inPeriod = input.entries.filter(
    (entry) => entry.startedAt >= startsAt && entry.startedAt <= input.now,
  );
  const bySource = groupBy(inPeriod, (entry) => entry.source.id);
  const sources = [...bySource.values()].map((entries) => sourceTotal(entries));
  return { period: input.period, startsAt, sources: sortedByName(sources) };
}

/** The total for one source, with its subjects under it. */
function sourceTotal(entries: readonly CostEntry[]): SourceCostTotal {
  const [first] = entries;
  const source = first?.source ?? { id: "", name: "" };
  const bySubject = groupBy(entries, (entry) => entry.subject.id);
  const subjects = [...bySubject.values()].map((subjectEntries) => {
    const subject = subjectEntries[0]?.subject ?? { id: "", name: "" };
    return total(subject, subjectEntries);
  });
  return { ...total(source, entries), subjects: sortedByName(subjects) };
}

/** Adds up a set of runs, keeping each currency apart. */
function total(
  named: { readonly id: string; readonly name: string },
  entries: readonly CostEntry[],
): CostTotal {
  const money = new Map<string, number>();
  let tokens = 0;
  for (const entry of entries) {
    const cost = entry.cost;
    if (cost.kind === "money") {
      assertWholeUnits(cost.minorUnits, cost.currency);
      money.set(cost.currency, (money.get(cost.currency) ?? 0) + cost.minorUnits);
    } else if (cost.kind === "tokens") {
      assertWholeTokens(cost.tokens);
      tokens += cost.tokens;
    }
  }
  const moneyTotals = [...money.entries()]
    .map(([currency, minorUnits]) => ({ currency, minorUnits }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
  return {
    id: named.id,
    name: named.name,
    money: moneyTotals,
    tokens,
    runs: entries.length,
    soFar: entries.some((entry) => entry.running),
  };
}

/** Refuses a fraction of a cent: it means a caller passed a float amount, not minor units. */
function assertWholeUnits(minorUnits: number, currency: string): void {
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) {
    throw new RangeError(
      `A run's cost must be a whole, non-negative number of ${currency} minor units, got ${minorUnits}.`,
    );
  }
}

/** Refuses a fraction of a token or a negative count: tokens are counted, never measured. */
function assertWholeTokens(tokens: number): void {
  if (!Number.isSafeInteger(tokens) || tokens < 0) {
    throw new RangeError(`A run's tokens must be a whole, non-negative number, got ${tokens}.`);
  }
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group === undefined) {
      groups.set(key(item), [item]);
    } else {
      group.push(item);
    }
  }
  return groups;
}

function sortedByName<T extends { readonly name: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Turns an amount written in whole units (0.11 euros, as a model's price
 * gives it) into whole minor units, using the currency's own number of
 * decimals. This is the one place a float amount becomes exact.
 *
 * @param amount - the amount in whole units
 * @param currency - an ISO 4217 code
 * @returns the amount in minor units, rounded to the nearest one
 *
 * @example
 * toMinorUnits(0.11, "EUR"); // 11
 * toMinorUnits(150, "JPY"); // 150
 */
export function toMinorUnits(amount: number, currency: string): number {
  const decimals =
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  // Shifting the decimal point in the text avoids float products such as 0.285 * 100 = 28.499….
  const shifted = Number(`${amount}e${decimals}`);
  // The text trick gives NaN only for amounts that print in exponent form (1e-7, 1e21); for
  // those the plain product is as exact as a float allows, and rounding below absorbs the rest.
  return Math.round(Number.isNaN(shifted) ? amount * 10 ** decimals : shifted);
}
