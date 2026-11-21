import { KindedError } from "@halonicjs/std";

/** What a read of a workflow the workspace doesn't have rejects with: Studio shows the item-gone state for it. */
export function workflowGone(): KindedError {
  return new KindedError("not_found", "This workflow isn't in this workspace any more.");
}

/** What a change of a step the workflow no longer has rejects with. */
export function stepGone(stepId: string): KindedError {
  return new KindedError("not_found", `This workflow has no step "${stepId}" any more.`);
}

/** What an edit of a workflow's file rejects with when the file is written in a way it can't change. */
export function cantChange(): KindedError {
  return new KindedError(
    "invalid_input",
    "This workflow's file couldn't be changed as it is written.",
  );
}
