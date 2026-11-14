/**
 * The few D1 calls the stores make. A Worker's `D1Database` binding fits it, and so does a
 * wrapper around one, which a test uses to make a batch fail.
 *
 * Values reach D1 only through `bind`: nothing a caller supplies is ever part of the SQL text.
 */
export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  all<Row = Record<string, unknown>>(): Promise<{ results: Row[] }>;
  run(): Promise<unknown>;
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  /** Runs the statements in order as one transaction: all take effect, or none. */
  batch(statements: SqlStatement[]): Promise<unknown[]>;
}
