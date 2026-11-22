import type { OutboxRow, UsageStorage } from "./usage-types.ts";

/** How many rows may wait for Cloud before the account takes no new work. */
export const defaultOutboxCap = 10_000;

const keys = { next: "outbox-next", count: "outbox-count", row: "outbox:" } as const;

/**
 * The rows waiting to go to Cloud, kept in the account's own storage. The account adds a row in
 * the same transaction as the change it reports, so a change is never kept without its row.
 * Rows are never dropped: at the cap the account takes no new work, and one `outbox-full` row
 * says so.
 */
export class UsageOutbox {
  readonly #storage: UsageStorage;
  readonly #cap: number;

  constructor(storage: UsageStorage, cap: number) {
    this.#storage = storage;
    this.#cap = cap;
  }

  /** How many rows are waiting. */
  size(): number {
    return this.#storage.get<number>(keys.count) ?? 0;
  }

  /** Whether the outbox is at its cap, so the account must take no new work. */
  isFull(): boolean {
    return this.size() >= this.#cap;
  }

  /** Adds `row`; call it inside the transaction that makes the change it reports. */
  add(row: OutboxRow): void {
    this.#put(row);
    if (this.size() === this.#cap && row.kind !== "outbox-full") {
      this.#put({ kind: "outbox-full", scope: scopeOf(row), rows: this.#cap, at: atOf(row) });
    }
  }

  /** The waiting rows, oldest first. */
  rows(): OutboxRow[] {
    return [...this.#storage.list<OutboxRow>(keys.row)].map(([, row]) => row);
  }

  #put(row: OutboxRow): void {
    const seq = this.#storage.get<number>(keys.next) ?? 0;
    // Zero-padded, so the rows list in the order they were added.
    this.#storage.put(keys.row + String(seq).padStart(12, "0"), row);
    this.#storage.put(keys.next, seq + 1);
    this.#storage.put(keys.count, this.size() + 1);
  }
}

function scopeOf(row: OutboxRow): string {
  return row.kind === "usage" ? row.record.scope : row.scope;
}

function atOf(row: OutboxRow): number {
  return row.kind === "usage" ? row.record.at : row.at;
}
