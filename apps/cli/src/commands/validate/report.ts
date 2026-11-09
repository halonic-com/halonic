import { filesOf, type LoadedWorkspace, type WorkspaceIssue } from "@halonicjs/workspace";

/**
 * The lines `halonic validate` prints for a loaded workspace, in the old
 * `studio validate`'s format so scripts that read it keep working: one line
 * per issue, then the number of errors, or `OK:` with the workspace's name,
 * its hubs and its warnings.
 *
 * @example
 * validateReport(workspace);
 * // ["warn  hubs/billing/workflows/extra.workflow.yaml: Workflow has no final state",
 * //  "OK: Acme, 1 hub(s), 1 warning(s)"]
 */
export function validateReport(workspace: LoadedWorkspace): string[] {
  const lines = workspace.issues.map(issueLine);
  const errors = countOf(workspace.issues, "error");
  if (errors > 0) {
    lines.push(`${errors} error(s)`);
    return lines;
  }
  const name = filesOf(workspace, "workspace")[0]?.value.name ?? workspace.location;
  const hubs = filesOf(workspace, "hub").length;
  lines.push(`OK: ${name}, ${hubs} hub(s), ${countOf(workspace.issues, "warning")} warning(s)`);
  return lines;
}

/** Whether the workspace has an error, so `halonic validate` fails. */
export function hasErrors(workspace: LoadedWorkspace): boolean {
  return countOf(workspace.issues, "error") > 0;
}

/**
 * One issue as the old CLI printed it: `error` or `warn ` (padded to the
 * same width), the file, then what the problem is about, then the message.
 */
function issueLine(issue: WorkspaceIssue): string {
  const label = issue.severity === "error" ? "error" : "warn ";
  return `${label} ${issue.file}: ${aboutPrefix(issue)}${issue.message}`;
}

/**
 * `YAML: ` for text that isn't YAML, the key path for a problem in a file's
 * own data, and nothing for a check across files, which names the item in
 * its message: the old CLI's prefixes.
 */
function aboutPrefix(issue: WorkspaceIssue): string {
  if (issue.source === "syntax") {
    return "YAML: ";
  }
  if (issue.source === "check" || issue.path.length === 0) {
    return "";
  }
  return `${issue.path.join(".")}: `;
}

function countOf(issues: readonly WorkspaceIssue[], severity: WorkspaceIssue["severity"]): number {
  return issues.filter((issue) => issue.severity === severity).length;
}
