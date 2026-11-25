import type { WorkflowStep, WorkflowStepProgram, WorkflowStepType } from "../api.ts";

/** An arrow's place in its step's list, as "Arrow 2 is now first." says it. */
const places = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

/** The workflow page's words (microcopy 9.3, flow-workflows 3 and 4; states C9, C16). */
export const pageWords = {
  kind: "WORKFLOW",
  /** The kind in the item page's header, which shows it in small caps. */
  kindWord: "Workflow",
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
  /**
   * Shown over the canvas, and read once, while an agent's steps are outlined, the steps named as
   * their cards name them: "2 steps use Sorter: Read the email, draft" (flow-workflows 9, C618).
   */
  outlined: (stepNames: readonly string[], agent: string) =>
    `${stepNames.length} ${stepNames.length === 1 ? "step uses" : "steps use"} ${agent}: ${stepNames.join(", ")}`,
  /** Beside that line: what drops the outline (C618). */
  outlineClears: "Pick a step or an empty spot to clear the outline.",
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
    /**
     * The card's title: the step's name as its card on the canvas shows it, its title or else its
     * id. No "Step" before it, which read "Step step-1" for a new step (C544, HAL-15120).
     */
    title: (step: Pick<WorkflowStep, "id" | "title">) => step.title ?? step.id,
    breadcrumb: (workflowName: string, stepId: string) => `${workflowName} › ${stepId}`,
    close: "Close step",
    type: "Type",
    /** The six kinds, as the Type picker names them (flow-workflows 5.2), and a rule step's own. */
    types: {
      task: "Agent step",
      wait: "Wait",
      final: "End",
      workflow: "Workflow",
      parallel: "Parallel",
      foreach: "For each",
      rule: "Rule",
    } satisfies Record<WorkflowStepType, string>,
    agent: "Agent",
    noAgent: "No agent: this step passes the data straight on.",
    /** Under the Agent picker while it shows an agent the hub doesn't have; the card's top says which. */
    agentNotInHub: "Pick one of this hub's agents.",
    prompt: "Prompt",
    promptEmpty: "The agent gets the run input.",
    output: "Save output as",
    outputHint: (name: string) => `Later steps can pick this as step ${name}.`,
    description: "Description",
    /** Save model 8.4: a key pasted into a field is not saved. */
    looksLikeKey: "This looks like a key. Keep it as a secret instead?",
    /** `name` as its card on the canvas names the step (`stepNames`). */
    couldntSave: (name: string) => `Couldn't change step ${name}`,
    /** Removing a step (flow-workflows 4.6, UX checklist 10.10). */
    remove: "Remove step",
    firstStep:
      "This is the first step. Pick another first step in Configuration › General before removing it.",
  },
  /**
   * The toasts of a removed step or arrow (flow-workflows 4.6; microcopy 9.3), each step named as
   * its card names it (C637).
   */
  removed: {
    step: (step: string, arrows: number) =>
      arrows === 0
        ? `Removed step ${step}`
        : `Removed step ${step} and ${arrows} ${arrows === 1 ? "arrow" : "arrows"}`,
    arrow: (from: string, to: string) => `Removed the arrow from ${from} to ${to}`,
    undo: "Undo",
    couldntPutBackStep: (step: string) => `Couldn't put back step ${step}`,
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
    /**
     * Under the row of an arrow an earlier one always beats (the core's `unguarded-shadow`, C548 1):
     * "Never taken: arrow 1 always matches first".
     */
    neverTakenRow: (beatenBy: number) => `Never taken: arrow ${beatenBy} always matches first`,
    /** Announced after a move or an add that left an arrow never taken. */
    neverTaken: (number: number, beatenBy: number) =>
      `Arrow ${number} is never taken: arrow ${beatenBy} always matches first.`,
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
    rule: "RULE STEP",
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
     * The problems band's next line for an agent that names a model alias the workspace doesn't
     * have (UX check S7, HAL-12412): the words around the alias, which the band sets in code style.
     * "*Writer* uses the model alias `smrt`, which this workspace doesn't have. Pick a model on
     * *Writer*'s page."
     */
    missingAlias: {
      before: (agent: string) => `${agent} uses the model alias `,
      after: (agent: string) =>
        `, which this workspace doesn't have. Pick a model on ${agent}'s page.`,
    },
    /**
     * The same line for an agent step's model alias (C605, decided by the team with Sofia): the
     * agent's page can't change an agent step's model, so it leads to Models. "*Writer*'s agent
     * step `short` uses the model alias `tiny`, which this workspace doesn't have. Add it in Models."
     * The band shows the step's name in code style, like the alias, since a step name is often an
     * ordinary word (C645, HAL-15897); so the line is split around both.
     */
    missingStepAlias: {
      before: (agent: string) => `${agent}'s agent step `,
      between: " uses the model alias ",
      after: ", which this workspace doesn't have. Add it in Models.",
    },
    openAgent: (agent: string) => `Open ${agent}`,
    openModels: "Open Models",
    /**
     * The problems band's line for another file whose errors stop the workflow (C544-3,
     * HAL-15343, decided by the team): "*Writer* has 1 problem that stops this workflow.", named
     * as the shared list of files with errors names it, with **Open writer.agent.yaml**. It says
     * "this workflow", not "it": the nearest "it" would be the file (C625-29).
     */
    blockingFile: (file: string, errors: number) =>
      errors === 1
        ? `${file} has 1 problem that stops this workflow.`
        : `${file} has ${errors} problems that stop this workflow.`,
    openFile: (fileName: string) => `Open ${fileName}`,
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
    programs: {
      "claude-code": "Claude Code",
      codex: "Codex",
      opencode: "OpenCode",
    } satisfies Record<WorkflowStepProgram["harness"], string>,
  },
} as const;
