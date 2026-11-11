import type { LoadedFile, WorkspaceIssue } from "../load-workspace.ts";
import { checkAgents } from "./agent-references.ts";
import { CheckContext, type ReadFile } from "./check-context.ts";
import { checkDelegationLoops } from "./delegation-loops.ts";
import { checkLocalOnly } from "./local-only.ts";
import { checkModelsFile, checkSessionModel } from "./model-aliases.ts";
import { checkRoutines } from "./routines.ts";
import { checkSubflowLoops, checkWorkflows } from "./workflows.ts";
import { checkWorkingFolders } from "./working-folders.ts";
import { checkDuplicateIds, checkTestTargets, checkWorkspaceFile } from "./workspace-files.ts";

/** One rule across files: the errors and warnings it finds. */
type WorkspaceCheck = (context: CheckContext) => WorkspaceIssue[];

/** The checks across files, in this order. Each file's issues keep this order. */
const checks: readonly WorkspaceCheck[] = [
  checkWorkspaceFile,
  checkDuplicateIds,
  checkModelsFile,
  checkSessionModel,
  checkAgents,
  checkDelegationLoops,
  checkWorkingFolders,
  checkTestTargets,
  checkWorkflows,
  checkSubflowLoops,
  checkRoutines,
  checkLocalOnly,
];

/**
 * The checks across files: what one file names in another (an agent's
 * model alias, a test's workflow) and rules over several files (agents that
 * delegate in a loop, two files with one id, a harness agent's working
 * folder that holds what a local connector runs), what a workflow runs and
 * calls, and what a routine runs and when it starts.
 *
 * @param files - the files that parsed
 * @param read - every file the loader read, with its kind and text, also
 *   those that failed: a check's line comes from the text
 * @returns the errors and warnings, each with its file, key path and line
 */
export function checkWorkspace(
  files: readonly LoadedFile[],
  read: readonly ReadFile[],
): WorkspaceIssue[] {
  const context = new CheckContext(files, read);
  return checks.flatMap((check) => check(context));
}
