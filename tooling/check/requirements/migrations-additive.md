# check.migrations-additive

- Status: active
- Since: 0.1.0
- Source: HAL-6704, decided on HAL-6804

If a numbered migration file in a `migrations` folder (a `.ts` file, so also one whose statements are multi-line template literals) has a statement that drops a table, index, column, view or trigger, renames something, changes a column's type or constraint, or adds a NOT NULL column with no default, then the `migrations-additive` check shall fail, name the file and line, and say that migrations only add and removal goes in a later migration.

## Examples

- Given `DROP TABLE record_changes` in `migrations/0004-cleanup.ts`, then the check fails on that line.
- Given `ALTER TABLE a RENAME TO b`, then the check fails on that line.
- Given `ALTER TABLE a ADD COLUMN note TEXT NOT NULL`, then the check fails; with `DEFAULT ''` or with no NOT NULL, it passes.
- Given `CREATE TABLE` and `CREATE INDEX` statements, then the check passes.
- Given a comment that mentions `DROP TABLE`, or a file outside a `migrations` folder, then the check passes.
- Given `.sql` migration files, they are out of scope: the check reads only numbered `.ts` migration files.
