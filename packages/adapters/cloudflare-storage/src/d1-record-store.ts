import { compactedChanges, type RecordChange, type RecordStore } from "@halonicjs/ports";
import type { SqlDatabase } from "./d1-database.ts";
import { runMigrations } from "./d1-migrations.ts";
import { migrations } from "./migrations/index.ts";

interface ChangeRow {
  seq: number;
  collection: string;
  id: string;
  at: string;
  op: RecordChange["op"];
  values: string | null;
  by: string | null;
}

const insertChange = `INSERT INTO record_changes (collection, id, at, op, "values", by) VALUES (?, ?, ?, ?, ?, ?)`;
const insertSeed = `INSERT INTO record_changes (seq, collection, id, at, op, "values", by) VALUES (?, ?, ?, ?, ?, ?, NULL)`;
const claimCompaction = "INSERT INTO record_compactions (collection, version) VALUES (?, ?)";

/**
 * A {@link RecordStore} over a D1 database: every collection's log is rows of one table,
 * `record_changes`, in the order they were appended.
 *
 * The collection name, ids and values are only ever bound parameters, never part of the SQL, so a
 * hostile name is just a string that matches no rows. The table is created by the migrations,
 * which run before the first call and again only on a new Worker.
 *
 * `compact` reads a collection's rows, then in one transaction deletes the rows it read and writes
 * the seeds in their place, under the lowest of the same `seq` numbers. A change appended while it
 * ran has a higher number, so it stays after the seeds and is folded onto them, never lost.
 *
 * Two compactions of one collection must not overlap: the second to write would delete the first's
 * seeds and write seeds that miss what the first folded in. So each claims the collection's next
 * compaction version in its transaction, and the one that read an out-of-date log fails to claim it
 * and rolls back. That call rejects; the log is untouched, and calling `compact` again is safe.
 * Claims are never deleted, so a version number is never claimed twice, however many compactions
 * finish while a slow one waits.
 *
 * @example
 * const records = new D1RecordStore(env.DB);
 * await records.append([{ at, collection: "leads", id: "1", op: "add", values: { name: "Ada" } }]);
 */
export class D1RecordStore implements RecordStore {
  readonly #db: SqlDatabase;
  #ready: Promise<void> | undefined;

  /** @param db - the D1 binding from the Worker's `env` */
  constructor(db: SqlDatabase) {
    this.#db = db;
  }

  async append(changes: readonly RecordChange[]): Promise<void> {
    if (changes.length === 0) {
      return;
    }
    await this.#migrated();
    await this.#db.batch(
      changes.map((change) =>
        this.#db
          .prepare(insertChange)
          .bind(
            change.collection,
            change.id,
            change.at,
            change.op,
            toJson(change.values),
            toJson(change.by),
          ),
      ),
    );
  }

  async changes(collection: string): Promise<RecordChange[]> {
    return (await this.#rows(collection)).map(toChange);
  }

  async compact(collection: string): Promise<void> {
    // The version is read before the rows: a compaction that lands in between fails our claim.
    const version = await this.#compactionVersion(collection);
    const rows = await this.#rows(collection);
    const last = rows.at(-1);
    if (last === undefined) {
      return;
    }
    const seeds = compactedChanges(collection, rows.map(toChange));
    await this.#db.batch([
      this.#db.prepare(claimCompaction).bind(collection, version + 1),
      this.#db
        .prepare("DELETE FROM record_changes WHERE collection = ? AND seq <= ?")
        .bind(collection, last.seq),
      ...seeds.map((seed, index) =>
        this.#db
          .prepare(insertSeed)
          .bind(
            (rows[index] as ChangeRow).seq,
            collection,
            seed.id,
            seed.at,
            seed.op,
            toJson(seed.values),
          ),
      ),
    ]);
  }

  async #compactionVersion(collection: string): Promise<number> {
    await this.#migrated();
    const { results } = await this.#db
      .prepare(
        "SELECT COALESCE(MAX(version), 0) AS version FROM record_compactions WHERE collection = ?",
      )
      .bind(collection)
      .all<{ version: number }>();
    return results[0]?.version ?? 0;
  }

  async #rows(collection: string): Promise<ChangeRow[]> {
    await this.#migrated();
    const { results } = await this.#db
      .prepare(
        `SELECT seq, collection, id, at, op, "values", by FROM record_changes WHERE collection = ? ORDER BY seq`,
      )
      .bind(collection)
      .all<ChangeRow>();
    return results;
  }

  /** Runs the migrations once; a failed run is not remembered, so the next call tries again. */
  #migrated(): Promise<void> {
    this.#ready ??= runMigrations(this.#db, migrations).catch((error: unknown) => {
      this.#ready = undefined;
      throw error;
    });
    return this.#ready;
  }
}

function toJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

function toChange(row: ChangeRow): RecordChange {
  const change: RecordChange = {
    at: row.at,
    collection: row.collection,
    id: row.id,
    op: row.op,
    values: row.values === null ? null : (JSON.parse(row.values) as Record<string, unknown>),
  };
  if (row.by !== null) {
    change.by = JSON.parse(row.by) as NonNullable<RecordChange["by"]>;
  }
  return change;
}
