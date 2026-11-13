import { DatabaseSync } from "node:sqlite";
import type { RunSql, SqlRow, SqlValue } from "../run-sql.ts";

/**
 * {@link RunSql} over Node's built-in SQLite in memory, so the run object's
 * logic runs in Node with coverage. Like a Durable Object's storage it runs
 * one statement at a time, and a transaction that throws leaves nothing behind.
 * `RunLogObject` in workerd runs the same logic over the real storage.
 */
export class NodeRunSql implements RunSql {
  readonly #db = new DatabaseSync(":memory:");

  exec<T extends SqlRow>(query: string, ...bindings: SqlValue[]): { toArray(): T[] } {
    const rows = this.#db.prepare(query).all(...(bindings as never[])) as unknown as T[];
    return { toArray: () => rows };
  }

  transactionSync<T>(change: () => T): T {
    this.#db.exec("BEGIN");
    try {
      const result = change();
      this.#db.exec("COMMIT");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }
}
