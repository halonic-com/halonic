import type { LoadedFile, WorkspaceIssue } from "../load-workspace.ts";
import { checkAgents } from "./agent-references.ts";
import { CheckContext, type ReadFile } from "./check-context.ts";
import { checkDelegationLoops } from "./delegation-loops.ts";
import { checkModelsFile, checkSessionModel } from "./model-aliases.ts";
import { checkRoutines } from "./routines.ts";
import { checkDuplicateIds, checkTestTargets, checkWorkspaceFile } from "./workspace-files.ts";

/** One rule across files: the errors it finds. */
type WorkspaceCheck = (context: CheckContext) => WorkspaceIssue[];

/** The checks across files, in this order. Each file's issues keep this order. */
const checks: readonly WorkspaceCheck[] = [
  checkWorkspaceFile,
  checkDuplicateIds,
  checkModelsFile,
  checkSessionModel,
  checkAgents,
  checkDelegationLoops,
  checkTestTargets,
  checkRoutines,
];

/**
 * The checks across files: what one file names in another (an agent's
 * model alias, a test's workflow) and rules over several files (agents that
 * delegate in a loop, two files with one id), and what a routine runs and
 * when it starts.
 *
 * @param files - the files that parsed
 * @param read - every file the loader read, with its kind and text, also
 *   those that failed: a check's line comes from the text
 * @returns the errors, each with its file, key path and line
 */
export function checkWorkspace(
  files: readonly LoadedFile[],
  read: readonly ReadFile[],
): WorkspaceIssue[] {
  const context = new CheckContext(files, read);
  return checks.flatMap((check) => check(context));
}
