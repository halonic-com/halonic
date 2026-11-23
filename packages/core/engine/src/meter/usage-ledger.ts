// What `ConfigMeter` has counted for one scope (requirement
// `engine.config-meter`): its use per unit and period, for the pool and for
// each member, and what steps hold back. It is one value in `Coordination`,
// changed with `compareAndSet`, so the pool and a member's share change
// together or not at all, and every instance of a deployment sees the same
// counts. Amounts are whole numbers in each unit's base, so they add up the
// same on every store: cost in micro-units, minutes in milliseconds.

import type { UsageLimit } from "@halonicjs/format";
import type { Coordination } from "@halonicjs/ports";
import type { CountedPeriod } from "./config-limits.ts";

/** A unit a limit counts. */
export type MeteredUnit = UsageLimit["unit"];

/** Amounts per unit, in each unit's base. */
export type UnitAmounts = Partial<Record<MeteredUnit, number>>;

/** What one step holds back until it is settled. */
export interface Held {
  readonly actor: string;
  /** When it was held, in milliseconds by the meter's clock. */
  readonly at: number;
  readonly amounts: UnitAmounts;
}

/** One scope's counts. A counter's key is `<unit>/<period start>`, such as `cost/2026-11`. */
export interface Ledger {
  readonly pool: Readonly<Record<string, number>>;
  readonly members: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly held: Readonly<Record<string, Held>>;
}

/** Whose counters: the whole scope's, or one member's. */
export type Holder = { readonly pool: true } | { readonly actor: string };

/** How much of one unit's base makes one of the unit as a limit writes it. */
const basePerUnit: Readonly<Record<MeteredUnit, number>> = {
  runs: 1,
  steps: 1,
  tokens: 1,
  cost: 1_000_000,
  harnessMinutes: 60_000,
};

/**
 * How long a hold lasts when its step is never settled, such as when the
 * engine stopped during it: far past the longest harness step, so a lost
 * settle can't keep a scope's use held back for good.
 */
const heldForMs = 24 * 60 * 60 * 1000;

/** How often a change is tried again when another instance changed the ledger first. */
const maxAttempts = 32;

const periods: readonly CountedPeriod[] = ["day", "month"];

/** `amount` of `unit`, as a limit writes it, in the unit's base. */
export function toBase(unit: MeteredUnit, amount: number): number {
  return Math.round(amount * basePerUnit[unit]);
}

/** `base` of `unit` as a limit writes it. */
export function fromBase(unit: MeteredUnit, base: number): number {
  return base / basePerUnit[unit];
}

/** The start of the UTC period `at` is in: `2026-11-23` for a day, `2026-11` for a month. */
export function periodStartOf(period: CountedPeriod, at: Date): string {
  const day = at.toISOString().slice(0, "2026-11-23".length);
  return period === "day" ? day : day.slice(0, "2026-11".length);
}

/** When the UTC period `at` is in ends and its use starts again from 0 (ISO). */
export function resetsAtOf(period: CountedPeriod, at: Date): string {
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth();
  const next =
    period === "day" ? Date.UTC(year, month, at.getUTCDate() + 1) : Date.UTC(year, month + 1, 1);
  return new Date(next).toISOString();
}

/** What the holder used of `unit` in the period `at` is in, in the unit's base. */
export function usedOf(
  ledger: Ledger,
  holder: Holder,
  unit: MeteredUnit,
  period: CountedPeriod,
  at: Date,
): number {
  const counters = "pool" in holder ? ledger.pool : (ledger.members[holder.actor] ?? {});
  return counters[`${unit}/${periodStartOf(period, at)}`] ?? 0;
}

/** What steps hold back of `unit` for the holder, in the unit's base. */
export function heldOf(ledger: Ledger, holder: Holder, unit: MeteredUnit): number {
  return Object.values(ledger.held)
    .filter((held) => "pool" in holder || held.actor === holder.actor)
    .reduce((total, held) => total + (held.amounts[unit] ?? 0), 0);
}

/** `ledger` with `amounts` added for the pool and for `actor`, in the day and the month of `at`. */
export function withUse(ledger: Ledger, actor: string, amounts: UnitAmounts, at: Date): Ledger {
  return {
    ...ledger,
    pool: added(ledger.pool, amounts, at),
    members: { ...ledger.members, [actor]: added(ledger.members[actor] ?? {}, amounts, at) },
  };
}

/** `ledger` without the counters of past periods and the holds that lasted their time. */
export function withoutPast(ledger: Ledger, at: Date): Ledger {
  const current = new Set(periods.map((period) => periodStartOf(period, at)));
  const keep = (counters: Readonly<Record<string, number>>) =>
    Object.fromEntries(
      Object.entries(counters).filter(([key]) => current.has(key.slice(key.indexOf("/") + 1))),
    );
  return {
    pool: keep(ledger.pool),
    members: Object.fromEntries(
      Object.entries(ledger.members).map(([actor, counters]) => [actor, keep(counters)]),
    ),
    held: Object.fromEntries(
      Object.entries(ledger.held).filter(([, held]) => at.getTime() - held.at < heldForMs),
    ),
  };
}

/** Where the ledgers of every scope are kept. */
export class LedgerStore {
  readonly #coordination: Pick<Coordination, "read" | "compareAndSet">;

  constructor(coordination: Pick<Coordination, "read" | "compareAndSet">) {
    this.#coordination = coordination;
  }

  /** The scope's ledger; an empty one when nothing was counted yet. */
  async read(scope: string): Promise<Ledger> {
    return parsedLedger(scope, await this.#coordination.read(keyOf(scope)));
  }

  /**
   * Changes the scope's ledger with `change`, which says what it becomes, or
   * `null` to leave it, and what to answer. Tried again from a fresh read
   * when another instance changed it first.
   *
   * @throws Error when it was changed under it every time
   */
  async change<Answer>(
    scope: string,
    change: (ledger: Ledger) => { readonly next: Ledger | null; readonly answer: Answer },
  ): Promise<Answer> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const text = await this.#coordination.read(keyOf(scope));
      const { next, answer } = change(parsedLedger(scope, text));
      if (next === null) return answer;
      if (await this.#coordination.compareAndSet(keyOf(scope), text, JSON.stringify(next))) {
        return answer;
      }
    }
    throw new Error(
      `The usage of "${scope}" kept changing under the meter ${maxAttempts} times, so it wasn't counted. Try again.`,
    );
  }
}

function keyOf(scope: string): string {
  return `config-meter/${scope}`;
}

/** @throws Error when the stored value isn't a ledger, rather than counting from 0 */
function parsedLedger(scope: string, text: string | null): Ledger {
  if (text === null) return { pool: {}, members: {}, held: {} };
  const value: unknown = JSON.parse(text);
  if (
    typeof value !== "object" ||
    value === null ||
    !("pool" in value && "members" in value && "held" in value)
  ) {
    throw new Error(`The meter's stored usage of "${scope}" isn't readable.`);
  }
  return value as Ledger;
}

function added(
  counters: Readonly<Record<string, number>>,
  amounts: UnitAmounts,
  at: Date,
): Record<string, number> {
  const next = { ...counters };
  for (const [unit, amount] of Object.entries(amounts)) {
    for (const period of periods) {
      const key = `${unit}/${periodStartOf(period, at)}`;
      next[key] = (next[key] ?? 0) + amount;
    }
  }
  return next;
}
