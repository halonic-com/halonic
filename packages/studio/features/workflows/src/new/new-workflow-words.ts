/** The New workflow dialog's words (microcopy 9.2, flow-workflows 2.2). */
export const newWorkflowWords = {
  title: "New workflow",
  create: "Create",
  creating: "Creating…",
  nameField: "Name",
  hubField: "Hub",
  nameMissing: "Give it a name.",
  startsWith: "It starts with a step “start” that leads to “done”.",
  file: (path: string) => `File: ${path}`,
  folder: (path: string) => `Folder: ${path}`,
  createFailed: (reason: string) => `Couldn't create the workflow: ${reason}.`,
} as const;
