/** A value SQLite stores, as the Durable Object's SQL API takes and gives it. */
export type SqlValue = string | number | null | ArrayBuffer;

/** One row of a result, by column name. */
export type SqlRow = Record<string, SqlValue>;

/**
 * The part of a Durable Object's SQLite storage the run object uses: plain
 * statements and a synchronous transaction. Durable Object storage is
 * wrapped to fit; Node tests give one over `node:sqlite`.
 */
export interface RunSql {
  /** Runs one statement. The rows come back as an array, empty for a statement that gives none. */
  exec<T extends SqlRow>(query: string, ...bindings: SqlValue[]): { toArray(): T[] };
  /**
   * Runs `change` as one step: all its writes happen, or none do. `change`
   * can't wait for anything, so nothing interleaves.
   */
  transactionSync<T>(change: () => T): T;
}

/** What {@link sqlOfStorage} reads from a Durable Object's `ctx.storage`. */
export interface SqlStorageOwner {
  sql: { exec<T extends SqlRow>(query: string, ...bindings: SqlValue[]): { toArray(): T[] } };
  transactionSync<T>(change: () => T): T;
}

/** The {@link RunSql} of a Durable Object's storage (`ctx.storage`). */
export function sqlOfStorage(storage: SqlStorageOwner): RunSql {
  return {
    exec: (query, ...bindings) => storage.sql.exec(query, ...bindings),
    transactionSync: (change) => storage.transactionSync(change),
  };
}
