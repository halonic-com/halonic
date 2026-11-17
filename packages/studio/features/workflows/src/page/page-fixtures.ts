import type { WorkflowView } from "../api.ts";

/** A three-step workflow, as the page tests read it. */
export const reply: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "start",
  steps: [
    { id: "start", type: "task" },
    { id: "write", type: "task", agent: "writer" },
    { id: "done", type: "final" },
  ],
  arrows: [
    { from: "start", to: "write" },
    { from: "write", to: "done", label: "ok" },
  ],
  layout: {},
};

/** Its configuration, as the page tests read it. */
export const settings = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "start",
  stepIds: ["start", "write", "done"],
  file: "hubs/acme/workflows/reply.workflow.yaml",
  problems: [],
} as const;
