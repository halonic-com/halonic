/** A workflow's test cases, as the Tests page lists them and runs them (see `api.ts`). */

/** How one test case ended the last time it ran. */
export interface WorkflowTestResult {
  readonly passed: boolean;
  /** The test run's id, for **Open run**; absent when the run left no log. */
  readonly runId?: string | undefined;
  /** Why it failed, as the core says it: `Expected to end in "archive", ended in "reply".` */
  readonly failure?: string | undefined;
  /** The steps the case expects the run to take, when it names them. */
  readonly expectedPath?: readonly string[] | undefined;
  /** The steps the run took. */
  readonly actualPath?: readonly string[] | undefined;
}

/** One test case of a workflow, as the Tests page lists it. */
export interface WorkflowTestCase {
  readonly name: string;
  /** The run input the case starts with, as JSON text. */
  readonly input: string;
  /** The step the case expects the run to end in; absent when it doesn't say. */
  readonly endsIn?: string | undefined;
  /** The last result; absent until the case has run. */
  readonly result?: WorkflowTestResult | undefined;
}

/** A workflow's test cases and when they last ran. */
export interface WorkflowTests {
  readonly cases: readonly WorkflowTestCase[];
  /** ISO time of the last run of all of them; absent when they never ran together. */
  readonly ranAt?: string | undefined;
}
