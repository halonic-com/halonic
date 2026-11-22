import { runDefinitionsIndexPath } from "./run-definitions-index.ts";
import { routineIndexPath } from "./webhook-routines.ts";

/**
 * The paths the snapshot keeps its indexes at, which no workspace file may
 * have. The writer refuses a file there and the source leaves them out of
 * `list`; both import this, so the source doesn't depend on the writer.
 */
export const snapshotIndexPaths: readonly string[] = [routineIndexPath, runDefinitionsIndexPath];
