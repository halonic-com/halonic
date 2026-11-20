import type { WorkflowRef } from "@halonicjs/studio-feature-workflows/api";

/** Where the workflow files of a hub are kept. */
export const workflowFolder = (hubId: string): string => `hubs/${hubId}/workflows`;

/** The ending of a workflow's file name. */
export const workflowSuffix = ".workflow.yaml";

/** Where the test cases of a workflow are kept: next to it, in the hub's `workflows` folder. */
export const testFile = ({ hubId, id }: WorkflowRef): string =>
  `${workflowFolder(hubId)}/${id}.test.yaml`;

/** The text of a new workflow: a step `start` that leads to the final step `done`. */
export function newWorkflowText(id: string, name: string): string {
  return [
    `id: ${id}`,
    // A JSON string is a YAML double-quoted one, so any name a person types is safe.
    `name: ${JSON.stringify(name)}`,
    "initial: start",
    "states:",
    "  start:",
    "    on:",
    "      - to: done",
    "  done:",
    "    type: final",
    "",
  ].join("\n");
}
