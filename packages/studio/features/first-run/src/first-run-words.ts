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
} as const;

/** The guide card's words on Support reply's page (first-run-flow 3.2). */
export const guideWords = {
  title: "Your first run",
  about:
    "This is Acme, an example company. Its support workflow reads a customer email, drafts a reply, and then waits for you to approve it.",
  emailLabel: "The email:",
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
} as const;
