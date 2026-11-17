/** Configuration's words (flow-agents 5.1 and 5.2; microcopy 8.5). */
export const configurationWords = {
  tab: "Configuration",
  pages: "Configuration pages",
  pageNames: { behaviour: "Behaviour" },
  description: "Description",
  instructions: "Instructions",
  /** Shown only while Instructions is empty (microcopy 8.5). */
  instructionsHint:
    "What it should do and how, in plain words. It follows this in every run and chat.",
  /** Save model 8.4: a key pasted into Description or Instructions is not saved. */
  looksLikeKey: "This looks like a key. Keep it as a secret instead?",
  loading: (name: string) => `Loading ${name}'s settings`,
  loadFailedTitle: (name: string) => `Couldn't load ${name}'s settings`,
  tryAgain: "Try again",
  notSaved: (count: number) => `${count} ${count === 1 ? "field" : "fields"} not saved`,
} as const;
