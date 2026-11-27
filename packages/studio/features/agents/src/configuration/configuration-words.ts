/** "9 Nov at 14:02" in the person's time zone, with the year when it isn't this one. */
function dayAndTime(at: Date, now: Date): string {
  const day = at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} at ${time}`;
}

/** Follows the warning's file changed line: Sofia's words on HAL-15766. */
const cantShowWhatChanged = "Studio can't show what changed, so check the file before you confirm.";

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
  /** Microcopy 8.5, UX 2.5: the cost at the end of the line under the picker. */
  aliasPrice: (input: string, output: string) => `${input} in, ${output} out per million tokens`,
  aliasNoPrice: "No price",
  addAPrice: "Add a price",
  aliasOnThisComputer: "On this computer, no cost",
  aliasTestModel: "Built-in test model, no cost",
  /** Microcopy L3: the line's ending for an agent on its program's subscription, with no **Add a price**. */
  aliasSubscription: (plan: string) => `On your ${plan} subscription, not priced`,
  /** The subscription each program signs in with, as the sandbox panel names it. */
  subscriptionPlans: { "claude-code": "Claude", codex: "ChatGPT" },
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
  /**
   * Flow 5.6, UX 2.5: the field error for a model the agent's harness can't call (HAL-18930).
   * OpenCode's copies Claude Code's, decided by the team under the HAL-2282 rule.
   */
  harnessRefused: {
    "claude-code": "Claude Code can use Anthropic models only.",
    codex: "This model can't be used with Codex. Choose another.",
    opencode: "OpenCode can use Anthropic models only.",
  },
  /** Flow 5.6, F25: under the alias line of a Codex agent on an OpenAI-compatible provider. */
  responsesApiWarning: "Make sure this endpoint supports the Responses API.",
  harness: "Harness",
  /** Flow-agents 5.3, the group's hint. */
  harnessHint: "What drives this agent",
  harnessNames: {
    halonic: "Halonic",
    "claude-code": "Claude Code",
    codex: "Codex",
    opencode: "OpenCode",
  },
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
  /** Harness › the sandbox fields in the agent's file (flow-agents 5.3; checklist 2.6 and 2.9). */
  sandboxFields: {
    workingFolder: "Working folder",
    change: "Change…",
    allowedSites: "Allowed sites",
    addSite: "Add site",
    /** The Add chip's box, named like the options' "New option". */
    newSite: "New site",
    removeSite: (site: string) => `Remove ${site}`,
  },
  /**
   * Harness › Where it runs (microcopy 8.5 and 23.4; checklist 3.8). The board approved these
   * words on HAL-1784 (11 Nov); `inSandboxNote` is the team's (revision 59).
   */
  whereItRuns: {
    label: "Where it runs",
    inSandbox: "In a sandbox (recommended)",
    inSandboxNote: "Can only write to its working folder and reach its allowed sites.",
    onThisComputer: "On this computer",
    onThisComputerNote: "Has your access to files and the network, without the sandbox.",
    /**
     * Under On this computer while this Studio can't start an agent outside its sandbox
     * (`studioStartsUnfenced`). Team decision by Sofia on HAL-13232, building on microcopy 23.4.
     * It says halonic in a terminal rather than listing the commands that start such an agent
     * (`run`, `serve`, `runs send`), so it doesn't go stale (Sofia on HAL-15847, HAL-15848).
     */
    studioCantStart:
      "Studio can't start it this way yet; halonic in a terminal on this computer can.",
    /**
     * Under On this computer while the choice is on hold, in place of `studioCantStart`: the agent
     * runs in the sandbox until then, wherever it starts. Team decision on HAL-15640 (C605).
     */
    onHoldNote: "On hold until you confirm again.",
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
      `${agent}'s file changed since you chose On this computer, so it runs in the sandbox until you confirm again.`,
    reviewAndConfirm: "Review and confirm",
    /**
     * Microcopy 23.4, "File changed, run controls": the Callout under a run page's header, below
     * any can't-run Callout, while an agent the page runs is on hold. Run stays enabled.
     */
    runControls: (agent: string) =>
      `${agent} runs in the sandbox until you confirm again: its file changed since you chose On this computer.`,
    /**
     * Microcopy 23.4, the warning's first line while the choice is on hold, and its link to the
     * agent's file (checklist 3.8): with the day and time it changed, when the host can tell. A
     * choice keeps only the file's fingerprint, so the line says Studio can't show what changed;
     * the link opens the file beside the agent instead of Changes, which lists only edits not in
     * a version yet (C626, HAL-15753).
     */
    fileChanged: (agent: string) => `${agent}'s file changed. ${cantShowWhatChanged}`,
    fileChangedOn: (agent: string, at: string, now = new Date()) =>
      `${agent}'s file changed on ${dayAndTime(new Date(at), now)}. ${cantShowWhatChanged}`,
    openFile: "Open the file ›",
    /**
     * The chip in the agent page's header while the agent runs on this computer, not while that
     * choice is on hold (checklist 3.8, HAL-15552); a screen reader hears the spoken line instead,
     * as with the run page's chip (microcopy 23.1).
     */
    fullAccess: "Full access",
    fullAccessSpoken: "Runs without the sandbox",
    /** The file changed while the warning was open, so nothing was saved; the warning stays for the new file. */
    changedWhileOpen: (agent: string) =>
      `${agent}'s file changed while this was open, so nothing was saved. Read this again, then confirm.`,
    /**
     * The agent's file has unsaved changes: the choice is for the saved file (HAL-13201). Studio
     * saves by itself, so there is nothing to press: confirm once the save lands (team decision on
     * HAL-15403, words check C571 row 73; microcopy 1.2 has no "Save first").
     */
    saveFirst: (agent: string) =>
      `${agent}'s file has changes that aren't saved yet. This choice is for the saved file, so confirm once they're saved.`,
    /**
     * In place of the choice where Studio can't make it (the browser). Team decision on HAL-15226,
     * from words check C553 (HAL-15219, row 41).
     */
    desktopOnly: "Choose where agents run in the desktop app.",
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
  /** After either line; it opens Library on that list's tab. It shows a "›" after it that isn't read. */
  openLibrary: "Open Library",
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
  /**
   * Under an agent step's own model the hub has no alias for (C605, decided by the team with
   * Sofia): microcopy 1.6's sentence without "Choose one", since the card doesn't edit the model.
   */
  agentStepUnknownAlias: (name: string) =>
    `${name} isn't a model alias in this workspace. Add it in Models.`,
  /** Its tools when the file leaves them out, and when it gives none (C462-6). */
  agentStepToolsAgent: (agent: string) => `All of ${agent}'s tools`,
  agentStepToolsNone: "None",
  /** The toast when a change of the subagents wasn't saved for another reason than a loop. */
  subagentsNotSaved: (agent: string) => `Couldn't save ${agent}'s subagents`,
  loading: (name: string) => `Loading ${name}'s settings`,
  loadFailedTitle: (name: string) => `Couldn't load ${name}'s settings`,
  modelsLoadFailedTitle: "Couldn't load the models",
  tryAgain: "Try again",
  /** A counter's name for screen readers, "Model, 1 error", as on the workflow page. */
  errors: (count: number) => `${count} ${count === 1 ? "error" : "errors"}`,
} as const;
