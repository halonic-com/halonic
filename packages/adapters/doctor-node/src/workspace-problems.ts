// The problems in a workspace's files that `doctor` counts (HAL-6613,
// HAL-14260): the ones `halonic validate` lists. `loadWorkspace` leaves each
// file with an error out, so what loads is not the workspace the user wrote.

import { workspaceProblemsOf } from "@halonicjs/adapter-workspace-models";
import type { LoadedWorkspace } from "@halonicjs/workspace";

/**
 * How many errors `halonic validate` finds in the workspace's files: the
 * problems that leave a file out or stop a run. Warnings do neither, so they
 * don't count.
 */
export function fileProblemsOf(workspace: LoadedWorkspace): number {
  return workspaceProblemsOf(workspace).filter((issue) => issue.severity === "error").length;
}
