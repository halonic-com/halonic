import type { WorkflowStepProgram, WorkflowStepType } from "../api.ts";

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
  /** The canvas's toolbar (flow-workflows 3.2, UX checklist 10.4). */
  toolbar: {
    label: "Flow tools",
    step: "Step",
    wait: "Wait",
    /** What a screen reader hears for **Step** and **Wait**, which say what they do (C285 TB1). */
    addStep: "Add step",
    addWait: "Add wait",
    autoLayout: "Auto layout",
    couldntChange: (name: string) => `Couldn't change ${name}`,
  },
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
  /**
   * The can't-run bands under the workflow page's header: the first lines of the problems and
   * files bands, and the sandbox Callout's last line (microcopy 23.3, "Can't run, workflow" and
   * "Phone"). Placeholders until HAL-1784 is approved: reviewers check the keys.
   */
  cantRun: {
    /** The first line of the band for a workflow with errors (HAL-14739, decided by the team). */
    problems: (name: string, errors: number) =>
      `${name} can't run: it has ${errors} ${errors === 1 ? "problem" : "problems"}.`,
    /**
     * The first line of the band for a run the files say Studio can't start (C471-1). The reason
     * starts with an agent's name, so it keeps its capital (E5).
     */
    refused: (name: string, reason: string) => `${name} can't run: ${reason}`,
    programStep: (step: string, program: string) => `The step ${step} uses ${program}.`,
    programSteps: (step: string, others: number) =>
      `The step ${step} and ${others} other ${others === 1 ? "step" : "steps"} use a program.`,
    changeIn: (agent: string) => `To run ${agent} without the sandbox, change it in`,
    agentSettings: (agent: string) => `${agent}'s settings ›`,
    onYourComputer: (agent: string) => `To change where ${agent} runs, use your computer.`,
    programs: { "claude-code": "Claude Code", codex: "Codex" } satisfies Record<
      WorkflowStepProgram["harness"],
      string
    >,
  },
} as const;
