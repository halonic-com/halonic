import type { CloudflareApi, Migration } from "./api.ts";
import { DeployError } from "./errors.ts";

export interface MigrateOptions {
  readonly accountId: string;
  /** The Worker's name; its database is `<worker>-data`. */
  readonly worker: string;
  /** Every migration this version of Halonic knows, oldest first. */
  readonly migrations: readonly Migration[];
  /** Lists what would be applied and changes nothing. */
  readonly plan?: boolean;
}

/** Brings the deployed database up to this version's schema; returns the ids it applied (or would). */
export async function migrate(
  api: CloudflareApi,
  options: MigrateOptions,
): Promise<readonly string[]> {
  const known = new Set(options.migrations.map((migration) => migration.id));
  if (known.size !== options.migrations.length)
    throw new DeployError("invalid-migrations", "Two migrations have the same id.");

  const database = `${options.worker}-data`;
  const applied = await api.appliedMigrations(options.accountId, database);
  // A database ahead of this CLI was migrated by a newer Halonic. Running on would deploy
  // code that doesn't know its schema, so stop and ask for an update.
  const ahead = applied.filter((id) => !known.has(id));
  if (ahead.length > 0)
    throw new DeployError(
      "schema-newer-than-cli",
      `The database has migrations this Halonic doesn't know (${ahead.join(", ")}). Update Halonic and deploy again.`,
    );

  const done = new Set(applied);
  const pending = options.migrations.filter((migration) => !done.has(migration.id));
  if (!options.plan) {
    for (const migration of pending)
      await api.applyMigration(options.accountId, database, migration);
  }
  return pending.map((migration) => migration.id);
}
