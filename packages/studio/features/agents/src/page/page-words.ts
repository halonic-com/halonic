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
  /**
   * R9: Try it records no run in 0.1, and a run doesn't say which agent ran in it. Said only when
   * no workflow runs the agent, so it can't have run (HAL-12399).
   */
  noRuns: "No runs with this agent yet.",
  /** Halonic runs an agent only as a step in a workflow in 0.1 (HAL-12399, rule N3 of HAL-12363). */
  runsInAWorkflow: (name: string) =>
    `${name} runs as a step in a workflow. Add it to one in Workflows.`,
  /** For an agent that workflows run: its runs are theirs, in Runs (HAL-12399). */
  runsInWorkflows: (name: string, workflows: readonly string[]) =>
    workflows.length === 1
      ? `${name} runs as a step in ${workflows[0]}. That workflow's runs are in Runs.`
      : `${name} runs as a step in ${workflows.length} workflows. Their runs are in Runs.`,
  /** When the workflows can't be read, the page doesn't guess whether the agent has run. */
  runsAsAStep: (name: string) => `${name} runs as a step in a workflow.`,
} as const;
