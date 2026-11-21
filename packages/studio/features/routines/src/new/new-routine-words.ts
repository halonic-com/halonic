/** The New routine dialog's words (microcopy 12.2, flow-routines 2.2). */
export const newRoutineWords = {
  title: "New routine",
  create: "Create",
  creating: "Creating…",
  tryAgain: "Try again",
  nameField: "Name",
  hubField: "Hub",
  nameMissing: "Give it a name.",
  promptField: "Prompt",
  promptPlaceholder: "Describe what to do.",
  promptNeeded: (agentName: string) => `Say what ${agentName} should do.`,
  runs: (targetName: string) =>
    `It runs ${targetName} when you press Run now. Pick when it runs on its own next.`,
  agentCantRun: (agentName: string) =>
    `This routine starts ${agentName}, but Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow, then pick it under Starts on the routine's page.`,
  nothingToRun: "Create a workflow or an agent first; a routine runs one of them.",
  newWorkflow: "New workflow",
  file: (path: string) => `File: ${path}`,
  folder: (path: string) => `Folder: ${path}`,
  createFailed: (reason: string) => `Couldn't create the routine: ${reason}.`,
} as const;
