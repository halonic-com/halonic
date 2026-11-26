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
  /**
   * The line when the engine refused the cancel because the workspace isn't trusted, as after
   * Remove trust (C676-3). **Review** beside it is the bar's one way out, so still no "Try again".
   */
  cancelUntrusted: "Couldn't cancel the run: this workspace isn't trusted yet.",
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

/**
 * "You did it" after the first run's Approve (first-run-flow 3.5), word for word. The facts line
 * reads "3 steps · 14 s · no cost, ran on this computer · logged with your yes".
 */
export const youDidItWords = {
  title: "Your first run is done.",
  steps: (count: number) => (count === 1 ? "1 step" : `${count} steps`),
  /** The cost part on a model on this computer. */
  localCost: "no cost, ran on this computer",
  logged: "logged with your yes",
  /** In place of the cost part on Sample answers, as its own line. */
  sample: "Sample answers. Add a key or a local model to use a real model.",
  /** Read while the run's numbers are read. */
  loading: "Reading the run…",
  next: "What next?",
  /** First on Sample answers, in place of Run it again: scripted answers can't answer a new message. */
  pickModel: "Pick a model",
  runAgain: "Run it again with your own message",
  change: "Change what the agents do",
  changeHint: "(open a file, or ask the chat)",
  /** Last under What next?, only while quick ask's keys work: "Ctrl+Alt+Space", "⌥Space" on macOS. */
  askAnywhere: (keys: string) => `Ask an agent from any app: ${keys}`,
  google:
    "Later: connect Gmail or Google Drive. About 15 minutes, once. It's in Settings when you want it.",
  close: "Close",
} as const;
