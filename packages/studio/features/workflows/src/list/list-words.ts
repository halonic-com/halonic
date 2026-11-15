/** The Workflows list's words (microcopy 9.1, flow-workflows 2.1). */
export const listWords = {
  title: "Workflows",
  sentence: "A workflow is a set of steps your agents work through, one after the other.",
  newWorkflow: "New workflow",
  searchLabel: "Search workflows",
  loadingLabel: "Loading workflows",
  chipsLabel: "Hub",
  allChip: "All",
  loadFailedTitle: "Couldn't load workflows",
  nothingYetTitle: "No workflows yet",
  emptyHub: (hubName: string) => `No workflows in ${hubName} yet.`,
  noMatch: (query: string) => `No workflows match "${query}".`,
  more: (name: string) => `More actions for ${name}`,
  needsYou: (count: number) => `${count} needs you`,
  running: (count: number) => `${count} running`,
  warnings: (count: number) => `${count === 1 ? "1 warning" : `${count} warnings`}`,
  problems: (count: number) => `${count === 1 ? "1 problem" : `${count} problems`}`,
} as const;

/** The reason a failed read gives, as one sentence ending in a full stop. */
export function failureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.endsWith(".") ? message : `${message}.`;
}
