import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { SqlDatabase, SqlStatement } from "./d1-database.ts";

/**
 * A stand-in for a D1 binding over Node's built-in SQLite, so code that uses D1 runs in Node and
 * its coverage can be measured. It is not the proof: D1 itself is, through the contract suites
 * run in workerd.
 */
export function sqliteDatabase(): SqlDatabase {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (sql: string, values: SQLInputValue[] = []): SqlStatement => ({
    bind: (...bound) => statement(sql, bound as SQLInputValue[]),
    all: async <Row>() => ({ results: sqlite.prepare(sql).all(...values) as Row[] }),
    run: async () => sqlite.prepare(sql).run(...values),
  });
  return {
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      sqlite.exec("BEGIN");
      try {
        const results: unknown[] = [];
        for (const each of statements) results.push(await each.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
