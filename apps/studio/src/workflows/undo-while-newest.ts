import { KindedError } from "@halonicjs/std";
import type { WorkspaceWorkflowsParts } from "./workspace-workflows-parts.ts";

/**
 * The undo of the change just made to `files`: the workspace's undo, so it puts the change back
 * only while it is still the newest step. After any other change it rejects with `refusal` and
 * undoes nothing.
 */
export function undoWhileNewest(
  files: WorkspaceWorkflowsParts["files"],
  refusal: string,
): () => Promise<void> {
  const afterChange = files.step;
  return async () => {
    if (files.step !== afterChange || !files.undo()) throw new KindedError("conflict", refusal);
  };
}
