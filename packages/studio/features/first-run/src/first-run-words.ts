import type { FirstRunStep } from "./first-run-state.ts";

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

/** The first run's group in the Help menu (first-run-flow 5 and 10.2 R8, decided by the team). */
export const helpWords = {
  title: "First run",
  showGuide: "Show the guide",
  startOver: "Start over",
} as const;
