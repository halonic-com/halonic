import type { Migration } from "../d1-migrations.ts";

/**
 * Lets the cron watchdog find the scopes with open runs without reading the whole run list: it asks
 * for the rows by `status`, which no earlier index leads with. With `scope` second, SQLite answers
 * from the index alone.
 */
export const runListByStatusMigration: Migration = {
  id: "0005-run-list-by-status",
  statements: ["CREATE INDEX run_list_by_status ON run_list (status, scope)"],
};
