/** The three steps of Get set up in a workspace that isn't the sample, in the card's order. */
export const ownSteps = ["model", "agent", "run"] as const;

/** One step of Get set up. */
export type OwnStepId = (typeof ownSteps)[number];

/**
 * The steps' words (flow-first-run 5.2, Sofia's new-workspace wording on HAL-12723). Steps 2 and 3
 * keep the hints of Get set up's rows in the kit's states.
 */
export const ownStepWords: Readonly<Record<OwnStepId, { title: string; hint: string }>> = {
  model: {
    title: "Connect your own model",
    hint: "Until then, agents use the test model, which repeats your message back.",
  },
  agent: { title: "Make your first agent", hint: "Give it a name and say what it should do." },
  run: { title: "Run it once", hint: "See what it does, step by step." },
};

/** The card's other words. */
export const ownCardWords = {
  /** The list's name, as the section's heading reads. */
  heading: "Get set up",
  caption: (done: number) => `${done} of 3 done`,
  /**
   * The finished card's closing line, in the shape of the sample card's "You've seen it work.":
   * it says why the card won't be there the next time Home opens (C614, HAL-15681).
   */
  finished: "You're set up. Get set up won't show here again.",
  /** The row's name for a screen reader: "Step 1 of 3: Connect your own model, not done". */
  stepLabel: (number: number, title: string, state: "done" | "not done" | "problem") =>
    `Step ${number} of 3: ${title}, ${state}`,
  /**
   * What step 1 waits for while it asks a local provider (first-run-progress 3.1): "Checking Ollama
   * at localhost:11434…", or "Checking Ollama…" without an address. It comes in parts, because the
   * card draws the address as code.
   */
  checking: (name: string, address: string | undefined) => ({
    before: address === undefined ? `Checking ${name}` : `Checking ${name} at `,
    address,
    after: "…",
  }),
  /** Step 1's cause when the local provider doesn't answer (first-run-progress 3.1). */
  notAnswering: (name: string, address: string | undefined) =>
    `${name} isn't answering${address === undefined ? "" : ` at ${address}`}. Start ${name}, or add an API key for a cloud model.`,
  checkAgain: "Check again",
  openModels: "Open Models",
};
