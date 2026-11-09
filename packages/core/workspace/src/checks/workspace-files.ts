import type { LoadedFile, WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";

/** Where a workspace's own settings live; every workspace has one. */
const workspaceFile = "workspace.yaml";

/** A workspace without a `workspace.yaml`. A file there that didn't parse has its own issue instead. */
export function checkWorkspaceFile(context: CheckContext): WorkspaceIssue[] {
  if (context.hasReadKind("workspace")) {
    return [];
  }
  return [context.error(workspaceFile, [], "missing-workspace-file", `Missing ${workspaceFile}`)];
}

/**
 * Two files of one kind in one hub (or both at the root) with the same id.
 * As in the old loader, each file after the first, by path, gets the issue
 * and names the first.
 */
export function checkDuplicateIds(context: CheckContext): WorkspaceIssue[] {
  const firstWithId = new Map<string, LoadedFile>();
  const issues: WorkspaceIssue[] = [];
  for (const file of context.files) {
    const id = idOf(file);
    if (id === undefined) {
      continue;
    }
    const key = [file.kind, file.hub ?? "", id].join("\n");
    const first = firstWithId.get(key);
    if (first === undefined) {
      firstWithId.set(key, file);
      continue;
    }
    const message = `Duplicate id "${id}" (also in ${first.path})`;
    issues.push(context.error(file.path, ["id"], "duplicate-id", message));
  }
  return issues;
}

/** A file's id; `undefined` for a kind without one, such as a workflow test. */
function idOf(file: LoadedFile): string | undefined {
  return "id" in file.value ? file.value.id : undefined;
}
