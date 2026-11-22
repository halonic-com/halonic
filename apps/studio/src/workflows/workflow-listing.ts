import { workspaceProblemsOf } from "@halonicjs/adapter-workspace-models";
import type { RunSummary } from "@halonicjs/events";
import type { WorkflowListing } from "@halonicjs/studio-feature-workflows/api";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { problemsOf } from "./workflow-files.ts";

/**
 * The Workflows list's rows: each hub's workflows with their problems counted, how many of their
 * runs wait or run, and how their newest run went. A workflow outside a hub isn't listed.
 *
 * @param runs - the workspace's runs, of every workflow
 */
export function workflowListingsOf(
  workspace: LoadedWorkspace,
  runs: readonly { readonly summary: RunSummary }[],
): WorkflowListing[] {
  const workspaceIssues = workspaceProblemsOf(workspace);
  return filesOf(workspace, "workflow").flatMap((file) => {
    if (file.hub === null) return [];
    const issues = problemsOf(workspace, workspaceIssues, file);
    const own = runs.filter(
      ({ summary }) =>
        summary.kind === "run" &&
        summary.hubId === file.hub &&
        summary.workflowId === file.value.id,
    );
    const newest = own.reduce<RunSummary | undefined>(
      (best, { summary }) =>
        best === undefined || summary.startedAt > best.startedAt ? summary : best,
      undefined,
    );
    return [
      {
        hubId: file.hub,
        id: file.value.id,
        name: file.value.name,
        description: file.value.description,
        problems: {
          errors: issues.filter((issue) => issue.severity === "error").length,
          warnings: issues.filter((issue) => issue.severity === "warning").length,
        },
        runs: {
          waiting: own.filter(({ summary }) => summary.status === "waiting").length,
          running: own.filter(({ summary }) => summary.status === "running").length,
        },
        lastRun:
          newest === undefined
            ? undefined
            : { startedAt: newest.startedAt, outcome: newest.status },
      },
    ];
  });
}
