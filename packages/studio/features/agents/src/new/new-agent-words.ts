/** The New agent dialog's words (microcopy 8.2, flow-agents 2.2). */
export const newAgentWords = {
  title: "New agent",
  create: "Create",
  creating: "Creating…",
  tryAgain: "Try again",
  nameField: "Name",
  hubField: "Hub",
  nameMissing: "Give it a name.",
  noModel: "It has no model yet. Pick one in Configuration › Model.",
  phoneNote: "It starts with the workspace's default model and runs in a sandbox on your computer.",
  file: (path: string) => `File: ${path}`,
  folder: (path: string) => `Folder: ${path}`,
  createFailed: (reason: string) => `Couldn't create the agent: ${reason}.`,
} as const;
