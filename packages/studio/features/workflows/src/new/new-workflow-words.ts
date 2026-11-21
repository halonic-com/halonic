/** The New workflow dialog's words (microcopy 9.2, flow-workflows 2.2). */
export const newWorkflowWords = {
  title: "New workflow",
  create: "Create",
  creating: "Creating…",
  tryAgain: "Try again",
  nameField: "Name",
  hubField: "Hub",
  nameMissing: "Give it a name.",
  startsWith: "It starts with a step “start” that leads to “done”.",
  file: (path: string) => `File: ${path}`,
  folder: (path: string) => `Folder: ${path}`,
  describe: "Describe it to the Assistant instead ›",
  createFailed: (reason: string) => `Couldn't create the workflow: ${reason}.`,
  defaultHubUnreadable: (file: string, line: number) =>
    `${file} can't be read right now (line ${line}). Fix it in the file, then try again`,
  defaultHubUnreadableOnPhone:
    "the Default hub's file can't be read right now. Fix it on a computer, then try again",
} as const;
