/**
 * What the runs' host says about a waiting run, for a Studio without a Runs list, such as the
 * served Studio (`studio.served-wait-context`): the same facts the desktop reads from its Runs
 * list and the run's log, so the wait card shows what an answer is about.
 */
export interface InboxWaitContext {
  /** The run's workflow, such as "Support reply"; its id when the workspace no longer has it. */
  readonly workflow: string;
  /**
   * By wait step, its description as written, for each step the host listed the run waiting at,
   * so an earlier step's card keeps its own description after the run moves on.
   */
  readonly descriptions: ReadonlyMap<string, string>;
  /** What the run started with in its workflow's start field, such as the customer's email. */
  readonly startInput?: string | undefined;
  /** Every model call of the run went to the test model: it says "Sample answers". */
  readonly sample: boolean;
}
