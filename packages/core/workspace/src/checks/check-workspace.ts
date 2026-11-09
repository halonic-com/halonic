import type { LoadedFile, WorkspaceIssue } from "../load-workspace.ts";
import { CheckContext, type ReadFile } from "./check-context.ts";
import { checkDelegationLoops } from "./delegation-loops.ts";
import { checkDuplicateIds, checkWorkspaceFile } from "./workspace-files.ts";

/** One rule across files: the errors it finds. */
type WorkspaceCheck = (context: CheckContext) => WorkspaceIssue[];

/** The checks across files, in this order. Each file's issues keep this order. */
const checks: readonly WorkspaceCheck[] = [
  checkWorkspaceFile,
  checkDuplicateIds,
  checkDelegationLoops,
];

/**
 * The checks across files: rules over several files, such as agents that
 * delegate in a loop or two files with one id.
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
