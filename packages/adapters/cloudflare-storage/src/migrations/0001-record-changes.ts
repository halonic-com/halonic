import type { Migration } from "../d1-migrations.ts";

/**
 * The change log of every collection. `seq` gives the log its order; the collection is a column
 * value, never part of a table name.
 */
export const recordChangesMigration: Migration = {
  id: "0001-record-changes",
  statements: [
    `CREATE TABLE record_changes (
       seq INTEGER PRIMARY KEY AUTOINCREMENT,
       collection TEXT NOT NULL,
       id TEXT NOT NULL,
       at TEXT NOT NULL,
       op TEXT NOT NULL,
       "values" TEXT,
       by TEXT
     )`,
    "CREATE INDEX record_changes_by_collection ON record_changes (collection, seq)",
  ],
};
