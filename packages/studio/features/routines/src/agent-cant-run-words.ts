/**
 * Why Halonic can't run an agent on its own yet and what to do instead, worded once for every place
 * that says it. Other features read it through `api.ts`.
 */
const agentCantRunWhy = "Halonic can't run an agent on its own yet, only as a step in a workflow.";
/** What to do instead, everywhere: the same first half, then the step for where the person is. */
const insteadFirst = "Make a workflow with the agent as a step";
const agentCantRunInstead = `${insteadFirst}, then pick it under Starts`;

/**
 * Why a routine can't start an agent yet (C52 claim 1.6) and what to do instead, written once for
 * the New routine dialog, the Starts card, Run now's refusal (HAL-14647) and an agent's Triggers
 * section (HAL-15452). The CLI's `halonic serve` says the same, ending in its own next step.
 */
export const agentCantRunWords = {
  why: agentCantRunWhy,
  /** Names Starts with no full stop, so the New routine dialog can add where Starts is. */
  instead: agentCantRunInstead,
  /** Both as one line, for the routine's own page, where Starts is. */
  line: `${agentCantRunWhy} ${agentCantRunInstead}.`,
  /**
   * The notice at the top of the page of a routine that starts an agent (C2 option (a) on
   * HAL-12374), which also says why Run now and Runs on its own are unavailable.
   */
  routineNotice: `${agentCantRunWhy} This routine won't start until it runs a workflow.`,
  /** The notice's button, which opens the Starts picker. */
  pickWhatItRuns: "Pick what it runs",
  /**
   * On the agent's own Triggers section, which lists the workflows the agent is a step in, each
   * with its own Add trigger, or offers New workflow when there is none.
   */
  onAgent: (inWorkflows: boolean) =>
    inWorkflows
      ? `${agentCantRunWhy} Add a trigger to a workflow it's a step in:`
      : `${agentCantRunWhy} ${insteadFirst}, then add a trigger to that workflow.`,
} as const;
