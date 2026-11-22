import { type FirstRunStep, firstRunSteps } from "./first-run-state.ts";

/** The first-run bar's words (first-run-flow 2 and 5, decided by the team). */
export const barWords = {
  /** The bar's name for screen readers. */
  label: "First run",
  steps: {
    demo: "Demo",
    model: "Model",
    run: "Run",
    approve: "Approve",
  } satisfies Record<FirstRunStep, string>,
  /** Read after a step's name. */
  done: "done",
  failed: "failed",
  /** The way out on the demo screen. */
  skip: "Skip, I'll explore",
  /** The way out while the run is going (3.4). */
  cancel: "Cancel run",
  /**
   * What "Couldn't …" names when the engine didn't cancel: "Couldn't cancel the run: *reason*."
   * (C671-45). No "Try again": the button beside it is **Cancel run**.
   */
  cancelFailed: "cancel the run",
  /** Said after **Cancel run**, where the button was, so the change isn't silent (C672 #3). */
  cancelled: "Run cancelled.",
} as const;

/**
 * What the first run says about its run (first-run-flow 3.4, 8e.2 and 10.2 R4): the change Continue
 * made, as one quiet line under the run's status and on the guide card after **Cancel run**, and
 * the one caption under the drawing.
 */
export const runWords = {
  caption: "Each box is an agent or a rule. You can change all of it later: it's plain files.",
  changedLocal: (model: string) =>
    `Changed 1 line in models.yaml: Agents now use ${model} on this computer.`,
  changedKey: (provider: string) => `Changed 1 line in models.yaml: Agents now use ${provider}.`,
  changedKeyAndLocalOnly: (provider: string) =>
    `Changed 2 lines: Agents now use ${provider} (models.yaml), and Local only is off for this workspace (workspace.yaml).`,
  /** A provider's file Continue added, which the line names too: the person owns those files. */
  added: (file: string) => `Added ${file}.`,
} as const;

/** The guide card's words on Support reply's page (first-run-flow 3.2). */
export const guideWords = {
  title: "Your first run",
  about:
    "This is Acme, an example company. Its support workflow reads a customer email, drafts a reply, and then waits for you to approve it.",
  emailLabel: "The email",
  email: "Sam writes that an order arrived damaged.",
  run: "Run your first workflow",
  /** After a run that ended without a win (3.4, 8b). */
  runAgain: "Run again",
} as const;

/** The Inbox's setup item of a paused first run (first-run-flow 5, decided by the team). */
export const setupWords = {
  /** How the Inbox names the setup while its view loads: "Loading the first run setup". */
  name: "first run",
  title: "Finish your first run",
  /** The line under the title: "Step 2 of 4 · Model". */
  progress: (step: FirstRunStep) =>
    `Step ${firstRunSteps.indexOf(step) + 1} of ${firstRunSteps.length} · ${barWords.steps[step]}`,
  continue: "Continue",
  dismiss: "Dismiss",
  /** The toast after **Dismiss**: Help is the only way back to the guide (C600, HAL-2282). */
  dismissed: "First run dismissed.",
  bringBack: "To bring it back, pick Help › First run › Show the guide again.",
} as const;

/**
 * The first run's group in the Help menu (first-run-flow 5 and 10.2 R8, decided by the team), with
 * the line under each item from Noah's drawn Help sheet (the board, C520-9 on HAL-14977). Start
 * over's "Your old copy stays where it is." stays word for word.
 */
export const helpWords = {
  title: "First run",
  showGuide: "Show the guide again",
  showGuideAbout: "Brings back the first-run bar and the guide card where you left off.",
  startOver: "Start over",
  startOverAbout:
    "Copies Acme to a new folder and begins again at the first step. Your old copy stays where it is.",
} as const;
