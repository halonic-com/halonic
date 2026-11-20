import type { WorkflowStepProgram, WorkflowStepType } from "../api.ts";

/** An arrow's place in its step's list, as "Arrow 2 is now first." says it. */
const places = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

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
  /** The tooltip on a step's output port (flow-workflows 4.3). */
  connectHint: "Drag to another step to connect",
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
    /** Removing a step (flow-workflows 4.6, UX checklist 10.10). */
    remove: "Remove step",
    firstStep:
      "This is the first step. Pick another first step in Configuration › General before removing it.",
  },
  /** The toasts of a removed step or arrow (flow-workflows 4.6; microcopy 9.3). */
  removed: {
    step: (stepId: string, arrows: number) =>
      arrows === 0
        ? `Removed step ${stepId}`
        : `Removed step ${stepId} and ${arrows} ${arrows === 1 ? "arrow" : "arrows"}`,
    arrow: (from: string, to: string) => `Removed the arrow from ${from} to ${to}`,
    undo: "Undo",
    couldntPutBackStep: (stepId: string) => `Couldn't put back step ${stepId}`,
    couldntPutBackArrow: (from: string, to: string) =>
      `Couldn't put back the arrow from ${from} to ${to}`,
  },
  /** The step card's arrows (flow-workflows 5.3, UX checklist 10.8 and 10.9; microcopy 9.4, 19.7). */
  arrows: {
    heading: "Arrows (first match wins)",
    to: (stepId: string) => `→ ${stepId}`,
    on: (event: string) => `on ${event}`,
    after: (time: string) => `after ${time}`,
    when: (condition: string) => `if ${condition}`,
    more: (number: number) => `More actions for arrow ${number}`,
    remove: (number: number) => `Remove arrow ${number}`,
    moveUp: "Move up",
    moveDown: "Move down",
    goTo: "Go to…",
    add: "Add",
    added: (from: string, to: string) => `Arrow added: ${from} to ${to}.`,
    /** "Arrow 2 is now first.": the arrow's old number and its new place. */
    moved: (number: number, place: number) =>
      `Arrow ${number} is now ${places[place - 1] ?? `number ${place}`}.`,
    /** The expanded row's fields (flow-workflows 5.3). */
    fields: {
      to: "To",
      event: "On event",
      /** An arrow without an event fires on done, the format's default. */
      eventNone: "done",
      useTimer: "Use a timer instead (fires if nothing happens in time)",
      after: "After",
      afterHint: "30m, 4h, 2d",
      condition: "Condition (JSON)",
      badJson: "This isn't valid JSON.",
      label: "Label",
    },
    arrowsIn: "Arrows in",
    from: (stepId: string) => `From ${stepId}`,
  },
  /** A condition in words, as an arrow's row shows it: "category = refund". */
  condition: {
    equals: "=",
    notEquals: "≠",
    contains: "contains",
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
    exists: (path: string) => `${path} is set`,
    not: (condition: string) => `not (${condition})`,
    and: " and ",
    or: " or ",
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
   * The can't-run Callout's last line on the workflow page (microcopy 23.3, "Can't run, workflow"
   * and "Phone"). Placeholders until HAL-1784 is approved: reviewers check the keys.
   */
  cantRun: {
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
