/** Configuration's words (flow-agents 5.1 and 5.2; microcopy 8.5). */
export const configurationWords = {
  tab: "Configuration",
  pages: "Configuration pages",
  pageNames: {
    behaviour: "Behaviour",
    model: "Model",
    harness: "Harness",
    tools: "Tools",
    subagents: "Subagents",
    agentSteps: "Agent steps",
  },
  description: "Description",
  instructions: "Instructions",
  /** Shown only while Instructions is empty (microcopy 8.5). */
  instructionsHint:
    "What it should do and how, in plain words. It follows this every time it runs.",
  /** Save model 8.4: a key pasted into Description or Instructions is not saved. */
  looksLikeKey: "This looks like a key. Keep it as a secret instead?",
  /** Flow-agents 5.2: the shape of the replies, as Tabs. */
  output: "Output",
  outputKinds: { text: "Text", choice: "One of a list", json: "JSON" },
  /** The chip list's Add chip and its box (checklist 2.4 and 2.9). */
  addOption: "Add",
  /** The Add chip's name for screen readers, which starts with what it shows. */
  addOptionName: "Add option",
  newOption: "New option",
  removeOption: (option: string) => `Remove ${option}`,
  /** A list of options needs one: the file can't hold an empty one (save model 1.2). */
  noOptions: "Add at least one option.",
  /** Microcopy 8.5. */
  schema: "Schema (JSON)",
  schemaHint: "The agent is asked to reply in this shape.",
  schemaInvalid: "This isn't valid JSON.",
  /** Valid JSON that a schema can't be, such as a list or a number. */
  schemaNotObject: "A schema is a JSON object, between { and }.",
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
  /** Flow-agents 5.2: the model settings, folded under More settings. */
  moreSettings: "More settings",
  temperature: "Temperature",
  temperatureHint: "From 0 to 2. Higher gives more varied replies. Empty uses the model's default.",
  temperatureInvalid: "Enter a number from 0 to 2.",
  topP: "Top-p",
  topPHint: "From 0 to 1. Empty uses the model's default.",
  topPInvalid: "Enter a number from 0 to 1.",
  maxTokens: "Max tokens",
  maxTokensHint: "The longest reply, in tokens. Empty uses the model's default.",
  maxTokensInvalid: "Enter a whole number above 0.",
  stop: "Stop",
  stopHint: "One per line. A reply ends before any of these.",
  reasoningEffort: "Reasoning effort",
  reasoningEffortHint: "For models that think before they reply.",
  reasoningEfforts: { default: "Model's default", low: "Low", medium: "Medium", high: "High" },
  /** Microcopy 1.6: the field error for a model the file names that is no alias (HAL-12390 S8). */
  unknownAlias: (name: string) =>
    `${name} isn't a model alias in this workspace. Choose one, or add it in Models.`,
  harness: "Harness",
  /** Flow-agents 5.3, the group's hint. */
  harnessHint: "What drives this agent",
  harnessNames: { halonic: "Halonic", "claude-code": "Claude Code", codex: "Codex" },
  /** Flow-agents 5.3, the lines under the options. */
  builtIn: "Built in. Needs nothing installed.",
  found: (program: string, version: string) => `Found ${program} ${version}`,
  /** Microcopy 8.5, the line under a harness option. */
  notInstalled: (program: string) => `${program} isn't installed.`,
  tooOld: (program: string, version: string, supported: string) =>
    `${program} ${version} isn't supported. Halonic needs ${supported.replace(/^>=/, "")} or newer.`,
  signedOut: (program: string, version: string) => `Found ${program} ${version} · not signed in`,
  howToInstall: "How to install",
  howToUpdate: "How to update",
  /** The host found the program but its check failed (harness-states rule 4; board P5). */
  couldntAskVersion: (program: string, reason: string) =>
    `Found ${program}, but couldn't ask its version: ${reason}`,
  /** The host itself couldn't be asked (D3 on HAL-12697). Neither shows a strip. */
  couldntCheck: (program: string, reason: string) => `Couldn't check ${program}: ${reason}`,
  checkAgain: "Check again",
  checking: "Checking…",
  /** Microcopy 8.5, the strip. */
  stripNotInstalled: (agent: string, program: string) =>
    `${agent} can't run until ${program} is installed.`,
  stripTooOld: (agent: string, program: string) =>
    `${agent} can't run until ${program} is updated.`,
  /** The strip's third state, in the words of the two above (team decision on HAL-6351). */
  stripSignedOut: (agent: string, program: string) =>
    `${agent} can't run until it's signed in to ${program}.`,
  /** Opens the program's own sign-in for this agent in a terminal (HAL-5395, board option 1). */
  signInForAgent: "Sign in for this agent",
  /** Above the command, when no terminal opened (team decision on HAL-5395). */
  couldntOpenTerminal: "Couldn't open a terminal. Run this, then choose Check again:",
  /** When the host couldn't be asked to open it at all (team decision on HAL-6351). */
  couldntOpenSignIn: (reason: string) => `Couldn't open the sign-in: ${reason}`,
  /**
   * Harness › Where it runs (microcopy 8.5 and 23.4; checklist 3.8). Placeholders until the board
   * approves HAL-1784, except `inSandboxNote` (team, revision 59): reviewers check the keys.
   */
  whereItRuns: {
    label: "Where it runs",
    inSandbox: "In a sandbox (recommended)",
    inSandboxNote: "Can only write to its working folder and reach its allowed sites.",
    onThisComputer: "On this computer",
    onThisComputerNote: "Has your access to files and the network, without the sandbox.",
    /** Microcopy 23.4, the warning: title, two sentences, and its danger button. */
    warningTitle: (agent: string) => `Run ${agent} on this computer, without the sandbox?`,
    warningAccess: (agent: string) =>
      `${agent} will have your access: it can read, change and delete any file you can, use your SSH keys and sign-ins, and reach any site.`,
    warningTrust: (agent: string) =>
      `Only choose this for an agent you trust. It applies on this computer only, and you'll be asked again if ${agent}'s file changes.`,
    confirm: "Run on this computer",
    cancel: "Cancel",
    saving: "Saving…",
    /** Microcopy 23.4, "File changed, Harness page": the Callout while the choice is on hold. */
    onHold: (agent: string) =>
      `${agent}'s file changed since you chose On this computer, so it won't run until you confirm again.`,
    reviewAndConfirm: "Review and confirm",
    /** The file changed while the warning was open, so nothing was saved; the warning stays for the new file. */
    changedWhileOpen: (agent: string) =>
      `${agent}'s file changed while this was open, so nothing was saved. Read this again, then confirm.`,
    notSaved: (reason: string) => `Couldn't save where it runs: ${reason}`,
    couldntRead: (reason: string) => `Couldn't read where it runs: ${reason}`,
  },
  /** The Tools page's lists (flow-agents 5.2). */
  toolLists: { skills: "Skills", knowledge: "Knowledge", connectors: "Connectors" },
  /** The picker's button under each list; an empty list shows only this (microcopy 8.5, MA16). */
  addTool: { skills: "Add skill", knowledge: "Add knowledge", connectors: "Add connector" },
  /** In place of the button when the hub can use none of the kind (microcopy 8.5, HAL-12870). */
  noneInLibrary: {
    skills: "No skills this hub can use yet.",
    knowledge: "No knowledge this hub can use yet.",
    connectors: "No connectors this hub can use yet.",
  },
  /** In place of the button when the agent has them all already (microcopy 8.5). */
  allAdded: {
    skills: "No more skills to add.",
    knowledge: "No more knowledge to add.",
    connectors: "No more connectors to add.",
  },
  /** After either line; it opens Library on that list's tab. */
  openLibrary: "Open Library ›",
  /** Under a list, for each item its file names that the hub can't use (microcopy 8.5, MA16, HAL-12870). */
  missingTool: {
    skills: (name: string) => `This hub can't use a skill called ${name}.`,
    knowledge: (name: string) => `This hub can't use a knowledge source called ${name}.`,
    connectors: (name: string) => `This hub can't use a connector called ${name}.`,
  },
  removeTool: (name: string) => `Remove ${name}`,
  toolsLoadFailedTitle: "Couldn't load the Library",
  /** The Subagents page (flow-agents 5.4, microcopy 8.5). */
  subagentsIntro: (agent: string) => `The agents ${agent} hands work to.`,
  addSubagent: "Add subagent",
  addSubagentTitle: (agent: string) => `Add a subagent to ${agent}`,
  pickAnAgent: "Pick an agent",
  orCreate: "Or create a new agent",
  /** The create box's heading when there is no agent to pick (parity). */
  newAgent: "New agent",
  newAgentName: "New agent's name",
  newAgentPlaceholder: "Name",
  /** Read politely once a change of the subagents is saved (a11y SA2). */
  subagentAdded: (agent: string) => `${agent} added.`,
  subagentCreated: (agent: string) => `${agent} created and added.`,
  subagentRemoved: (agent: string) => `${agent} removed.`,
  teamLoadFailedTitle: "Couldn't load the hub's agents",
  /** The Agent steps page (flow-agents 5.2, microcopy 8.5). */
  noAgentStepsTitle: "No agent steps yet",
  noAgentStepsText:
    "An agent step is a named piece of work inside this agent, with its own instructions, model and model call limit.",
  newAgentStep: "New agent step",
  agentStepName: "Name",
  agentStepNameMissing: "Give it a name.",
  create: "Create",
  creating: "Creating…",
  agentStepInstructions: "What should it do?",
  /** The hint under it, as in New agent (flow-agents 2.2). */
  agentStepInstructionsHint: "This becomes its instructions.",
  /** Team decision (HAL-13179): the file can't hold an agent step without instructions. */
  agentStepInstructionsMissing: "Say what it should do.",
  agentStepCreateFailed: (reason: string) => `Couldn't create the agent step: ${reason}.`,
  /** The agent step card (flow-agents 7). */
  agentStepModelAgent: (model: string | undefined) =>
    model === undefined ? "The agent's model" : `${model}, the agent's model`,
  agentStepLimitAgent: (limit: number) => `${limit}, the agent's limit`,
  /** Its tools when the file leaves them out, and when it gives none (C462-6). */
  agentStepToolsAgent: (agent: string) => `All of ${agent}'s tools`,
  agentStepToolsNone: "None",
  /** The toast when a change of the subagents wasn't saved for another reason than a loop. */
  subagentsNotSaved: (agent: string) => `Couldn't save ${agent}'s subagents`,
  loading: (name: string) => `Loading ${name}'s settings`,
  loadFailedTitle: (name: string) => `Couldn't load ${name}'s settings`,
  modelsLoadFailedTitle: "Couldn't load the models",
  tryAgain: "Try again",
} as const;
