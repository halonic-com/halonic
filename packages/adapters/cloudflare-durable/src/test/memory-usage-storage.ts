// Test code only: never import it from a runtime bundle.
import type { UsageStorage } from "../usage-types.ts";

/**
 * A {@link UsageStorage} in a map, strict where a Durable Object would be: it writes only inside a
 * transaction, a transaction that throws leaves nothing behind, and values are copied in and out.
 */
export class MemoryUsageStorage implements UsageStorage {
  #entries = new Map<string, unknown>();
  #inTransaction = false;

  transactionSync<T>(change: () => T): T {
    if (this.#inTransaction) throw new Error("A transaction is already open.");
    const before = new Map(this.#entries);
    this.#inTransaction = true;
    try {
      return change();
    } catch (error) {
      this.#entries = before;
      throw error;
    } finally {
      this.#inTransaction = false;
    }
  }

  get<T>(key: string): T | undefined {
    return structuredClone(this.#entries.get(key)) as T | undefined;
  }

  put<T>(key: string, value: T): void {
    this.#writing();
    this.#entries.set(key, structuredClone(value));
  }

  delete(key: string): void {
    this.#writing();
    this.#entries.delete(key);
  }

  list<T>(prefix: string): [string, T][] {
    return [...this.#entries.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .map((key) => [key, this.get<T>(key) as T]);
  }

  /** Everything stored, as JSON, for a test that looks for what must not be there. */
  dump(): string {
    return JSON.stringify([...this.#entries]);
  }

  #writing(): void {
    if (!this.#inTransaction) throw new Error("A write outside a transaction.");
  }
}
