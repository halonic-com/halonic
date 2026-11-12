import type { SqlDatabase } from "./d1-database.ts";

/** One step of the schema: statements that run together, once per database. */
export interface Migration {
  /** Never changes after the migration ships; the order of the list is the order they run in. */
  id: string;
  statements: readonly string[];
}

const migrationsTable = "schema_migrations";

/**
 * Brings a database up to date: runs each migration it hasn't applied yet, in order, each as one
 * transaction together with the note that it ran. Running it again does nothing.
 *
 * Two Workers starting together may both try the same migration. One wins; the other's
 * transaction rolls back, finds the migration applied and moves on.
 *
 * The statements are the package's own SQL, never built from a caller's values.
 *
 * @param db - the D1 binding
 * @param migrations - every migration, oldest first
 * @throws Error when two migrations share an id
 */
export async function runMigrations(
  db: SqlDatabase,
  migrations: readonly Migration[],
): Promise<void> {
  const ids = migrations.map((migration) => migration.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Two migrations have the same id.");
  }
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ${migrationsTable} (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    )
    .run();
  for (const migration of migrations) {
    if (!(await appliedIds(db)).has(migration.id)) {
      await apply(db, migration);
    }
  }
}

async function appliedIds(db: SqlDatabase): Promise<Set<string>> {
  const { results } = await db.prepare(`SELECT id FROM ${migrationsTable}`).all<{ id: string }>();
  return new Set(results.map((row) => row.id));
}

async function apply(db: SqlDatabase, migration: Migration): Promise<void> {
  try {
    await db.batch([
      ...migration.statements.map((sql) => db.prepare(sql)),
      db.prepare(`INSERT INTO ${migrationsTable} (id) VALUES (?)`).bind(migration.id),
    ]);
  } catch (error) {
    // Another Worker may have applied it between our look and our write.
    if (!(await appliedIds(db)).has(migration.id)) {
      throw error;
    }
  }
}
