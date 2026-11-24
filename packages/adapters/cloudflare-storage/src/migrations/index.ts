import type { Migration } from "../d1-migrations.ts";
import { recordChangesMigration } from "./0001-record-changes.ts";
import { recordCompactionsMigration } from "./0002-record-compactions.ts";
import { runListMigration } from "./0003-run-list.ts";
import { scopeMigration } from "./0004-scope.ts";
import { runListByStatusMigration } from "./0005-run-list-by-status.ts";

/** Every migration, oldest first. A new one goes at the end; one that has shipped is never edited. */
export const migrations: readonly Migration[] = [
  recordChangesMigration,
  recordCompactionsMigration,
  runListMigration,
  scopeMigration,
  runListByStatusMigration,
];
