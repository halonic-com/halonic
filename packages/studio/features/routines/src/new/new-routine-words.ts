/** The New routine dialog's words (microcopy 12.2, flow-routines 2.2). */
export const newRoutineWords = {
  title: "New routine",
  create: "Create",
  creating: "Creating…",
  tryAgain: "Try again",
  nameField: "Name",
  hubField: "Hub",
  nameMissing: "Give it a name.",
  runs: (targetName: string) =>
    `It runs ${targetName} when you press Run now. Pick when it runs on its own next.`,
  agentCantRun: (agentName: string) =>
    `This routine starts ${agentName}, but routines can't start an agent yet. Point it at a workflow to run it.`,
  nothingToRun: "Create a workflow or an agent first; a routine runs one of them.",
  newWorkflow: "New workflow",
  file: (path: string) => `File: ${path}`,
  folder: (path: string) => `Folder: ${path}`,
  createFailed: (reason: string) => `Couldn't create the routine: ${reason}.`,
} as const;
