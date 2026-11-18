/** The New agent dialog's words (microcopy 8.2, flow-agents 2.2). */
export const newAgentWords = {
  title: "New agent",
  create: "Create",
  creating: "Creating…",
  tryAgain: "Try again",
  nameField: "Name",
  hubField: "Hub",
  instructionsField: "What should it do? (optional)",
  instructionsHint: "This becomes its instructions.",
  looksLikeKey: "This looks like a key. Keep it as a secret instead?",
  nameMissing: "Give it a name.",
  noModel: "It has no model yet. Pick one in Configuration › Model.",
  startNote: "It starts with the workspace's default model.",
  file: (path: string) => `File: ${path}`,
  folder: (path: string) => `Folder: ${path}`,
  createFailed: (reason: string) => `Couldn't create the agent: ${reason}.`,
} as const;
