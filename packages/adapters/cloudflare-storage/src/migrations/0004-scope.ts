import type { Migration } from "../d1-migrations.ts";

/**
 * Puts every record row and compaction claim under a scope, as the run list's rows already are,
 * so the stores of several users or organisations share one database and each sees only its own.
 *
 * `record_changes` keeps its table and gains a `scope` column: `seq` is its own key, so the scope
 * needn't be part of it, and a Worker version still running the old code keeps writing rows that
 * the new code reads. Rows written before this migration are the deployment's own, under the empty
 * scope a runtime without a principal uses.
 *
 * A compaction claim's key has to hold the scope, or two scopes compacting a collection of the same
 * name would claim each other's versions. SQLite can't change a key in place, so the claims move to
 * `record_compactions_scoped`; the old table is removed in a later migration, once no released
 * version writes to it. A claim only guards a compaction that is running, so none needs copying.
 *
 * The run list gains who started each run and who may see it. A row already there is the
 * deployment's or a user's own, so it is `private`, and under a user's scope `u/<id>` it was started
 * by that user.
 */
export const scopeMigration: Migration = {
  id: "0004-scope",
  statements: [
    "ALTER TABLE record_changes ADD COLUMN scope TEXT NOT NULL DEFAULT ''",
    "CREATE INDEX record_changes_by_scope ON record_changes (scope, collection, seq)",
    `CREATE TABLE record_compactions_scoped (
       scope TEXT NOT NULL,
       collection TEXT NOT NULL,
       version INTEGER NOT NULL,
       PRIMARY KEY (scope, collection, version)
     )`,
    "ALTER TABLE run_list ADD COLUMN started_by TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE run_list ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'",
    "UPDATE run_list SET started_by = substr(scope, 3) WHERE substr(scope, 1, 2) = 'u/'",
  ],
};
