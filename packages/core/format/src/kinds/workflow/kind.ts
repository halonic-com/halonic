import type { FileKind } from "../../kind.ts";
import { Workflow } from "./schema.ts";

/**
 * `workflows/<id>.workflow.yaml`, at the root or in a hub. The rules between
 * states (reachable, no dead ends, timers only on waits) are
 * `@halonicjs/workflow`'s, which sits above this package.
 */
export const workflowKind: FileKind<Workflow> = {
  name: "workflow",
  about: "A workflow: a state machine of agent steps, waits, subflows and timers.",
  syntax: "yaml",
  schema: Workflow,
  places: [{ scope: "workspace-and-hub", folder: "workflows", name: "<id>.workflow.yaml" }],
  idFromPlace: "fallback",
};
