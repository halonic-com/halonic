import type { FileKind } from "../../kind.ts";
import { renameKey } from "../../shared/legacy-keys.ts";
import { WorkflowTest } from "./schema.ts";

/** `workflows/<workflow>.test.yaml`, next to the workflow it tests. */
export const workflowTestKind: FileKind<WorkflowTest> = {
  name: "workflowTest",
  about: "Test cases for a workflow, run on scripted model replies.",
  syntax: "yaml",
  schema: WorkflowTest,
  places: [{ scope: "workspace-and-hub", folder: "workflows", name: "<id>.test.yaml" }],
  // The test names its workflow in `workflow`; it has no id of its own.
  idFromPlace: "none",
  // Workflows were called flows: `flow:` still names the workflow.
  upgradeKeys: (data) => renameKey(data, "flow", "workflow"),
};
