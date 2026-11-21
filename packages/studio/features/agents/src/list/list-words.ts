/** The Agents list's words (microcopy 8.1, flow-agents 2.1). */
export const listWords = {
  title: "Agents",
  sentence:
    "An agent is an AI worker you describe in a file: its instructions, model, skills, knowledge and tools.",
  newAgent: "New agent",
  searchLabel: "Search agents",
  loadingLabel: "Loading agents",
  chipsLabel: "Hub",
  allChip: "All",
  loadFailedTitle: "Couldn't load agents",
  tryAgain: "Try again",
  tryingAgain: "Trying again…",
  nothingYetTitle: "No agents yet",
  emptyHub: (hubName: string) => `No agents in ${hubName} yet.`,
  noMatch: (query: string) => `No agents match "${query}".`,
  /** Read after a search or a hub change (HAL-14241). */
  shownCount: (count: number) => (count === 1 ? "1 agent." : `${count} agents.`),
  more: (name: string) => `More actions for ${name}`,
} as const;

/** The search and command words (microcopy 8.1). */
export const searchWords = {
  title: "Agents",
  detail: (hubName: string) => `Agent · ${hubName}`,
  newCommand: "New agent",
} as const;
