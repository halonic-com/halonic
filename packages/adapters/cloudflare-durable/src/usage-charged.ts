import type { UsageAmounts, UsageStorage } from "./usage-types.ts";

/** Who a charge belongs to. */
export interface Owner {
  runId: string;
  actor: string;
}

/** What a reservation or record id was charged, so a repeat changes nothing. */
export interface Charged extends Owner {
  amounts: UsageAmounts;
  by: "settle" | "expiry" | "record";
}

/** A charged id found in the current period or in the one before it. */
export interface FoundCharge {
  readonly key: string;
  readonly charged: Charged;
  readonly periodStart: number;
}

/** The periods whose charged ids an account still knows: the current one and the one before. */
export interface KnownPeriods {
  readonly periodStart: number;
  readonly previousStart: number;
}

const prefix = "charged:";

/** How many old charged ids one transaction deletes at most, so a transaction stays small. */
export const chargedPruneBatch = 500;

/**
 * The ids an account charged, kept per period. The previous period's ids stay through one rollover,
 * so a step that ran out just before a new period and settles just after is still corrected, and a
 * record that comes again is still counted once. Older periods' ids are inert and are deleted a
 * batch at a time.
 */
export class ChargedIds {
  readonly #storage: UsageStorage;

  constructor(storage: UsageStorage) {
    this.#storage = storage;
  }

  /** The id's charge in the current period or the one before, if it has one. */
  find(id: string, periods: KnownPeriods): FoundCharge | undefined {
    for (const periodStart of [periods.periodStart, periods.previousStart]) {
      const key = chargedKey(periodStart, id);
      const charged = this.#storage.get<Charged>(key);
      if (charged !== undefined) return { key, charged, periodStart };
    }
    return undefined;
  }

  /** Keeps `charged` under the id in the given period. */
  put(periodStart: number, id: string, charged: Charged): void {
    this.#storage.put<Charged>(chargedKey(periodStart, id), charged);
  }

  /** Deletes up to {@link chargedPruneBatch} ids of periods before `previousStart`. */
  prune(previousStart: number): void {
    const keep = chargedKey(previousStart, "");
    const old: string[] = [];
    for (const [key] of this.#storage.list(prefix)) {
      // Keys sort by period, so the first kept key ends the old ones.
      if (key >= keep || old.length >= chargedPruneBatch) break;
      old.push(key);
    }
    for (const key of old) this.#storage.delete(key);
  }
}

/** Pads the period so keys sort by period whatever its number of digits. */
function chargedKey(periodStart: number, id: string): string {
  return `${prefix}${String(periodStart).padStart(16, "0")}:${id}`;
}
