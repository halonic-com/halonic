import type { SheetHosts } from "@halonicjs/format";
import type { LoadedFile, WorkspaceIssue } from "../load-workspace.ts";
import { checkAgents } from "./agent-references.ts";
import { CheckContext, type ReadFile } from "./check-context.ts";
import { checkDelegationLoops } from "./delegation-loops.ts";
import { checkHubUses } from "./hub-uses.ts";
import { checkDefaultRuntimes, checkInstructionFiles } from "./ignored-settings.ts";
import { checkIntegrationSettings } from "./integration-settings.ts";
import { checkLocalOnly } from "./local-only.ts";
import { checkModelsFile, checkSessionModel } from "./model-aliases.ts";
import { checkModelProviders } from "./model-providers.ts";
import { checkRoutines } from "./routines.ts";
import { checkWorkflowTests } from "./workflow-tests.ts";
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
  checkModelProviders,
  checkSessionModel,
  checkHubUses,
  checkAgents,
  checkDelegationLoops,
  checkWorkingFolders,
  checkTestTargets,
  checkWorkflowTests,
  checkWorkflows,
  checkSubflowLoops,
  checkRoutines,
  checkLocalOnly,
  checkIntegrationSettings,
  checkDefaultRuntimes,
  checkInstructionFiles,
];

/**
 * The checks across files: what one file names in another (an agent's
 * model alias, a test's workflow, the agents and steps a test names, a
 * hub's shared items) and rules over several files (agents that delegate in
 * a loop, two files with one id, a harness agent's working folder that holds
 * what a local connector runs), what a workflow runs and calls, what a
 * routine runs and when it starts, and settings Halonic ignores.
 *
 * @param files - the files that parsed
 * @param read - every file the loader read, with its kind and text, also
 *   those that failed: a check's line comes from the text
 * @param listed - every path of the workspace, also of files no kind reads
 * @param sheetHosts - the hosts of the plugins' and local integrations' sheets, when known
 * @returns the errors and warnings, each with its file, key path and line
 */
export function checkWorkspace(
  files: readonly LoadedFile[],
  read: readonly ReadFile[],
  listed: readonly string[],
  sheetHosts?: SheetHosts,
): WorkspaceIssue[] {
  const context = new CheckContext(files, read, listed, sheetHosts);
  return checks.flatMap((check) => check(context));
}
