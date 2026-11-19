/** The Starts card's words (flow-routines 3.6 and 3.11, microcopy 12.3). */
export const startsWords = {
  label: "Starts",
  /** The picker lists workflows and agents together, so each option says which it is. */
  pick: "Workflow or agent",
  workflowOption: (name: string) => `${name} (workflow)`,
  agentOption: (name: string) => `${name} (agent)`,
  input: "Input",
  inputHint: "The workflow's input, as a JSON object.",
  notObject: "The input has to be a JSON object, such as {}.",
  prompt: "Prompt",
  promptNeeded: "Give the agent something to do.",
  notFound: "not found",
  neverLive: (name: string) => `${name} isn't live yet, so this routine can't start it.`,
  newTargetNotLive: (live: string) =>
    `Your new choice isn't live yet. Until it is, the routine starts ${live}.`,
  inTrash: (name: string) => `${name} is in the trash, so this routine won't start it.`,
  placeholders: (names: readonly string[]) => {
    const wrapped = names.map((name) => `{{${name}}}`);
    const last = wrapped.pop();
    return wrapped.length === 0
      ? `You can use ${last}`
      : `You can use ${wrapped.join(", ")} and ${last}`;
  },
  couldntSave: (reason: string) => `Couldn't save the change. ${reason}`,
} as const;
