import type { WorkflowStepType } from "../api.ts";

/** The workflow page's words (microcopy 9.3, flow-workflows 3 and 4; states C9, C16). */
export const pageWords = {
  kind: "WORKFLOW",
  loading: (name: string) => `Loading ${name}`,
  stillLoading: "Still loading",
  loadFailedTitle: "Couldn't load this workflow",
  tryAgain: "Try again",
  startIt: "Start it from a terminal:",
  canvas: "Workflow canvas",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Fit to screen",
  startChip: "Start",
  noAgent: "No agent",
  /**
   * Where a card leads, read out after its name, since a screen reader doesn't see the arrows
   * (a11y check E1). One sentence for the ways on without words, one per way with words.
   */
  waysOn: {
    next: (targets: readonly string[]) => `Next: ${targets.join(", or ")}`,
    labelled: (label: string, target: string) => `${label}: ${target}`,
  },
  stepKind: {
    task: "AGENT STEP",
    wait: "WAIT",
    final: "END",
    workflow: "WORKFLOW STEP",
    parallel: "PARALLEL STEP",
    foreach: "FOR EACH STEP",
  } satisfies Record<WorkflowStepType, string>,
} as const;
