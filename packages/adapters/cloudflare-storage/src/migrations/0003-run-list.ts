import type { Migration } from "../d1-migrations.ts";

/**
 * The run list: one row per run, the copy of its log the `RunStore` lists from. A run's own object
 * is the truth and fills this table from its outbox, so a row can lag its run. `seq` is the last
 * event the row reflects, and a write only replaces a row with a higher one. Run ids are compared
 * as they are written (SQLite's default `BINARY` order), so `run_x` and `RUN_X` are two runs. The
 * `scope` lets several deployments, or test cases, share one database: each sees only its own rows.
 */
export const runListMigration: Migration = {
  id: "0003-run-list",
  statements: [
    `CREATE TABLE run_list (
       scope TEXT NOT NULL,
       run_id TEXT NOT NULL,
       seq INTEGER NOT NULL,
       hub_id TEXT NOT NULL,
       workflow_id TEXT NOT NULL,
       kind TEXT NOT NULL,
       status TEXT NOT NULL,
       started_at_ms INTEGER NOT NULL,
       summary TEXT NOT NULL,
       PRIMARY KEY (scope, run_id)
     )`,
    "CREATE INDEX run_list_by_start ON run_list (scope, started_at_ms DESC, run_id)",
  ],
};
