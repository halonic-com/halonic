import type { WorkflowStepType } from "../api.ts";

/** The workflow page's words (microcopy 9.3, flow-workflows 3 and 4; states C9, C16). */
export const pageWords = {
  kind: "WORKFLOW",
  loading: (name: string) => `Loading ${name}`,
  stillLoading: "Still loading",
  loadFailedTitle: "Couldn't load this workflow",
  tryAgain: "Try again",
  canvas: "Workflow canvas",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Fit to screen",
  startChip: "Start",
  noAgent: "No agent",
  stepKind: {
    task: "AGENT STEP",
    wait: "WAIT",
    final: "END",
    workflow: "WORKFLOW STEP",
    parallel: "PARALLEL STEP",
    foreach: "FOR EACH STEP",
  } satisfies Record<WorkflowStepType, string>,
} as const;
