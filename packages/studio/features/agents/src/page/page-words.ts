/** The agent page's words (microcopy 8.4, flow-agents 3.1 and 8; states R9). */
export const pageWords = {
  kind: "AGENT",
  /** The kind as the shell's item page header has it, in small caps: "Agent", "Agent name". */
  kindWord: "Agent",
  loading: (name: string) => `Loading ${name}`,
  stillLoading: "Still loading",
  loadFailedTitle: "Couldn't load this agent",
  tryAgain: "Try again",
  nameTaken: (name: string) => `An agent called ${name} already exists.`,
  /**
   * Flow-agents 3.1: under the name field while a new name is typed, the places that use the agent.
   * Up to 5 names in full; more are 4 names and "and *n* more", as the Files tree's rename line.
   */
  alsoUpdates: (owners: readonly string[]) => {
    const names =
      owners.length > 5
        ? `${owners.slice(0, 4).join(", ")} and ${owners.length - 4} more`
        : owners.join(", ");
    return `Also updates ${owners.length} ${owners.length === 1 ? "place" : "places"}: ${names}`;
  },
  /** A workflow step that runs the agent, in that line: "Inbox flow (Sort mail)". */
  placeStep: (workflow: string, step: string) => `${workflow} (${step})`,
  /** A routine that starts the agent, in that line. */
  placeRoutine: (routine: string) => `${routine} (routine)`,
  views: "Agent views",
  /** Microcopy 2 and flow-agents 3.1: under the header while saved changes aren't in a version. */
  changesNotLive: "Changes not live yet",
  /** Flow-agents 3.3: opens Create version with only this agent. */
  reviewAndMakeLive: "Review and make live",
  /** The same words as a routine's Make live (flow-routines 3.8). */
  couldntMakeLive: (name: string) => `Couldn't make ${name} live.`,
  saveFailed: "The file couldn't be written.",
  couldntSave: (reason: string) => `Couldn't save: ${reason}`,
  /** Read when a card drops because its part is gone (a11y 6.5, checklist 1.10). */
  cardRemoved: (title: string) => `${title} was removed.`,
  /** The team chart's accessible name (flow-agents 5.4). */
  teamChart: (name: string) => `Who works with ${name}`,
  /** A subagent's card leads to the subagent's own page (flow-agents 6 Clicks, UX 9.9). */
  openAgent: (name: string) => `Open ${name} ›`,
  runsHeading: "Runs",
  /**
   * R9: the Runs list can't show one agent's runs yet, so the line leads there with
   * **Open the Runs page ›** (HAL-12642, HAL-12934). Said only when no workflow runs the agent
   * (HAL-12399).
   */
  noRuns: "Studio can't list runs by agent yet.",
  openRuns: "Open the Runs page ›",
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
