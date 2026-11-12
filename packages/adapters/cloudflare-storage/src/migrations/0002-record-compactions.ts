import type { Migration } from "../d1-migrations.ts";

/**
 * Which compaction of a collection is the latest. A compaction claims the next version of its
 * collection in the same transaction as its writes; the primary key lets only one claim of a version
 * succeed, so a compaction that read an out-of-date log fails instead of overwriting a newer one.
 */
export const recordCompactionsMigration: Migration = {
  id: "0002-record-compactions",
  statements: [
    `CREATE TABLE record_compactions (
       collection TEXT NOT NULL,
       version INTEGER NOT NULL,
       PRIMARY KEY (collection, version)
     )`,
  ],
};
