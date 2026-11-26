// The write-ahead shadow ledger: every evaluation is on disk before anyone
// sees its result. The store behind it can only append.

import type { Clock, Sha256 } from "@halonicjs/std";
import { chainEntry, type LedgerEntry, type LedgerInput } from "./ledger-entry.ts";

/**
 * Where the ledger's entries live. It can only append and read: there is no
 * way to change or remove an entry once written.
 */
export interface LedgerStore {
  /** The newest entry, or `null` while the ledger is empty. */
  last(): Promise<LedgerEntry | null>;
  /** Writes the entry after the others. Resolves only once it is on disk. */
  append(entry: LedgerEntry): Promise<void>;
  /** Every entry, oldest first. */
  entries(): Promise<readonly LedgerEntry[]>;
}

/** What a {@link Ledger} needs. */
export interface LedgerOptions {
  readonly store: LedgerStore;
  readonly digest: Sha256;
  readonly clock: Clock;
}

/** Appends evaluations to a store as a hash chain, one at a time. */
export class Ledger {
  readonly #options: LedgerOptions;
  // Appends run one after another, so two never link to the same entry.
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: LedgerOptions) {
    this.#options = options;
  }

  /**
   * Links the evaluation to the newest entry and writes it.
   *
   * @returns the entry, once the store has it on disk
   */
  append(input: LedgerInput): Promise<LedgerEntry> {
    const appended = this.#queue.then(() => this.#appendNow(input));
    this.#queue = appended.catch(() => undefined);
    return appended;
  }

  async #appendNow(input: LedgerInput): Promise<LedgerEntry> {
    const { store, digest, clock } = this.#options;
    const entry = await chainEntry(await store.last(), input, clock.now(), digest);
    await store.append(entry);
    return entry;
  }
}

/**
 * Runs an evaluation and returns its result only after its ledger entry is
 * written. If the write fails, the result is never returned: no entry, no
 * result.
 *
 * @param ledger - the shadow ledger
 * @param evaluate - the evaluation; its result says what goes in the entry
 */
export async function evaluateWriteAhead<Result extends LedgerInput>(
  ledger: Ledger,
  evaluate: () => Result | Promise<Result>,
): Promise<Result> {
  const result = await evaluate();
  await ledger.append(result);
  return result;
}
