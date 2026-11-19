import type { WorkflowStepType } from "../api.ts";

/** The workflow page's words (microcopy 9.3, flow-workflows 3 and 4; states C9, C16). */
export const pageWords = {
  kind: "WORKFLOW",
  /** The header's name field (UX checklist 10.2, microcopy 9.1). */
  nameField: "Workflow name",
  nameTaken: (name: string) => `A workflow called ${name} already exists.`,
  renamed: (name: string) => `Renamed to ${name}.`,
  couldntRename: (name: string) => `Couldn't rename ${name}`,
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
  /** The docked step card (flow-workflows 5.1, 5.2; microcopy 9.4). */
  stepCard: {
    title: (stepId: string) => `Step ${stepId}`,
    breadcrumb: (workflowName: string, stepId: string) => `${workflowName} › ${stepId}`,
    close: "Close step",
    type: "Type",
    /** The six kinds, as the Type picker names them (flow-workflows 5.2). */
    types: {
      task: "Agent step",
      wait: "Wait",
      final: "End",
      workflow: "Workflow",
      parallel: "Parallel",
      foreach: "For each",
    } satisfies Record<WorkflowStepType, string>,
    agent: "Agent",
    noAgent: "No agent: this step passes the data straight on.",
    prompt: "Prompt",
    promptEmpty: "The agent gets the run input.",
    output: "Save output as",
    outputHint: (name: string) => `Later steps can pick this as step ${name}.`,
    description: "Description",
    /** Save model 8.4: a key pasted into a field is not saved. */
    looksLikeKey: "This looks like a key. Keep it as a secret instead?",
    couldntSave: (stepId: string) => `Couldn't change step ${stepId}`,
  },
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
