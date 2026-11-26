/** What the Inbox says about the run behind an item, read from the Runs list. */
export interface RunFacts {
  /** The hub the run's workflow is in; with the run's id it opens the run's page. */
  readonly hubId: string;
  /** The workflow's name, or its id when it's no longer in the workspace. */
  readonly workflow: string;
  /** What started the run, as it reads after "Started by": "you, with Run", "a message". */
  readonly startedBy: string;
  /** Every model call of the run went to the test model: its row says "Sample answers" (`inbox.wait-context`). */
  readonly sample?: boolean;
  /** The input field the workflow's start fills, such as `mail`; left out when it has none. */
  readonly startField?: string | undefined;
  /** A step's description as the workflow file writes it; left out when the workflow is gone. */
  readonly stepDescription?: ((stateId: string) => string | undefined) | undefined;
}

/** The facts of a run by its id; `undefined` while the Runs list doesn't have it. */
export type RunFactsOf = (runId: string) => RunFacts | undefined;
