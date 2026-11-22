/** The Starts card's words (flow-routines 3.6 and 3.11, microcopy 12.3). */
export const startsWords = {
  label: "Starts",
  /** The picker lists workflows and agents together, so each option says which it is. */
  pick: "Workflow or agent",
  workflowOption: (name: string) => `${name} (workflow)`,
  agentOption: (name: string) => `${name} (agent)`,
  /** The phone's row under the picker that opens what the routine starts. */
  open: (name: string) => `Open ${name}`,
  input: "Input",
  inputHint: "The workflow's input, as a JSON object.",
  /**
   * Under the workflow's own start field while it is empty, and its error once the engine refuses
   * the start for it (`missing-routine-input`, RT2 of HAL-15304): an empty field leaves the key out
   * of the input, so the routine doesn't start (C656 #5).
   */
  startEmpty: (name: string) => `${name} needs this. Left empty, the routine won't start.`,
  advanced: "Advanced",
  notObject: "The input has to be a JSON object, such as {}.",
  prompt: "Prompt",
  promptPlaceholder: "Describe what to do.",
  promptNeeded: (name: string) => `Say what ${name} should do.`,
  neverLive: (name: string) => `${name} isn't live yet, so this routine can't start it.`,
  newTargetNotLive: (live: string) =>
    `Your new choice isn't live yet. Until it is, the routine starts ${live}.`,
  inTrash: (name: string) => `${name} was deleted, so this routine won't start it.`,
  placeholders: (names: readonly string[]) => {
    const wrapped = names.map((name) => `{{${name}}}`);
    const last = wrapped.pop();
    return wrapped.length === 0
      ? `You can use ${last}`
      : `You can use ${wrapped.join(", ")} and ${last}`;
  },
  couldntSave: (reason: string) => `Couldn't save the change. ${reason}`,
} as const;
