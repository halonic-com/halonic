/** The agent page's words (microcopy 8.4, flow-agents 3.1 and 8; states R9). */
export const pageWords = {
  kind: "AGENT",
  loading: (name: string) => `Loading ${name}`,
  stillLoading: "Still loading",
  loadFailedTitle: "Couldn't load this agent",
  tryAgain: "Try again",
  nameField: "Name",
  nameMissing: "Give it a name.",
  nameTaken: (name: string) => `An agent called ${name} already exists.`,
  views: "Agent views",
  saveFailed: "The file couldn't be written.",
  couldntSave: (reason: string) => `Couldn't save: ${reason}`,
  runsHeading: "Runs",
  /** R9: the Runs list can't show one agent's runs yet, so this points there (HAL-12642). */
  noRuns: "Runs aren't listed by agent yet. See them on the Runs page.",
  /** Halonic runs an agent only as a step in a workflow in 0.1 (HAL-12399, rule N3 of HAL-12363). */
  runsInAWorkflow: (name: string) =>
    `${name} runs as a step in a workflow. Add it to one in Workflows.`,
} as const;
