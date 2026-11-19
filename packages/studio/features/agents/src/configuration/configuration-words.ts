/** Configuration's words (flow-agents 5.1 and 5.2; microcopy 8.5). */
export const configurationWords = {
  tab: "Configuration",
  pages: "Configuration pages",
  pageNames: { behaviour: "Behaviour", model: "Model", harness: "Harness", tools: "Tools" },
  description: "Description",
  instructions: "Instructions",
  /** Shown only while Instructions is empty (microcopy 8.5). */
  instructionsHint:
    "What it should do and how, in plain words. It follows this every time it runs.",
  /** Save model 8.4: a key pasted into Description or Instructions is not saved. */
  looksLikeKey: "This looks like a key. Keep it as a secret instead?",
  model: "Model",
  /** Shown in the picker while the file names no model, or one that no longer exists. */
  chooseModel: "Choose a model",
  /**
   * Shown in the picker while the file names no model and the workspace has a default (HAL-12214
   * A5). An alias called `default`, as in every new workspace, would only repeat the word.
   */
  workspaceDefault: (name: string) =>
    name === "default" ? "Workspace default" : `Workspace default (${name})`,
  noAliases: "No models yet. Add one in Models.",
  /** `maxSteps` counts per step, and Claude Code and Codex don't read it (HAL-12642). */
  turnLimit: "Model call limit",
  turnLimitHint:
    "The most model calls in one step. Empty means 6. Claude Code and Codex agents don't use it.",
  /** Microcopy 8.5. */
  turnLimitInvalid: "Enter a whole number from 1 to 200.",
  /** Microcopy 1.6: the field error for a model the file names that is no alias (HAL-12390 S8). */
  unknownAlias: (name: string) =>
    `${name} isn't a model alias in this workspace. Choose one, or add it in Models.`,
  harness: "Harness",
  harnessNames: { halonic: "Halonic", "claude-code": "Claude Code", codex: "Codex" },
  /** Microcopy 8.5, the line under a harness option. */
  notInstalled: (program: string) => `${program} isn't installed.`,
  tooOld: (program: string, version: string, supported: string) =>
    `${program} ${version} isn't supported. Halonic needs ${supported.replace(/^>=/, "")} or newer.`,
  signedOut: (program: string, version: string) => `Found ${program} ${version} · not signed in`,
  /** The check itself didn't work (harness-states rule 4): the option line and Check again only. */
  couldntCheck: (program: string) => `Couldn't check ${program}.`,
  checkAgain: "Check again",
  checking: "Checking…",
  /** Microcopy 8.5, the strip. */
  stripNotInstalled: (agent: string, program: string) =>
    `${agent} can't run until ${program} is installed.`,
  stripTooOld: (agent: string, program: string) =>
    `${agent} can't run until ${program} is updated.`,
  /** The Tools page's lists (flow-agents 5.2). */
  toolLists: { skills: "Skills", knowledge: "Knowledge", connectors: "Connectors" },
  /** The picker's button under each list; an empty list shows only this (microcopy 8.5, MA16). */
  addTool: { skills: "Add skill", knowledge: "Add knowledge", connectors: "Add connector" },
  /** In place of the button when the hub's Library has none of the kind (microcopy 8.5). */
  noneInLibrary: {
    skills: "No skills yet.",
    knowledge: "No knowledge yet.",
    connectors: "No connectors yet.",
  },
  /** In place of the button when the agent has them all already (microcopy 8.5). */
  allAdded: {
    skills: "No more skills to add.",
    knowledge: "No more knowledge to add.",
    connectors: "No more connectors to add.",
  },
  /** After either line; it opens Library on that list's tab. */
  openLibrary: "Open Library ›",
  /** Under a list, for each item its file names that the Library doesn't have (microcopy 8.5, MA16). */
  missingTool: {
    skills: (name: string) => `There's no skill called ${name}.`,
    knowledge: (name: string) => `There's no knowledge source called ${name}.`,
    connectors: (name: string) => `There's no connector called ${name}.`,
  },
  removeTool: (name: string) => `Remove ${name}`,
  toolsLoadFailedTitle: "Couldn't load the Library",
  loading: (name: string) => `Loading ${name}'s settings`,
  loadFailedTitle: (name: string) => `Couldn't load ${name}'s settings`,
  modelsLoadFailedTitle: "Couldn't load the models",
  tryAgain: "Try again",
} as const;
