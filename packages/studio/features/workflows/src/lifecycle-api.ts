/** What creating, trashing and deleting a workflow hand over (see `api.ts`). */

/** A workflow that was moved to the trash, and the way to bring it back. */
export interface TrashedWorkflow {
  /**
   * Puts the workflow and its tests back, after later changes too. It rejects with `conflict`, and
   * undoes nothing, when a file has taken their place since.
   */
  undo(): Promise<void>;
}

/** What runs a workflow, counted for the warning of its delete. */
export interface WorkflowUsers {
  /** The routines that start it. */
  readonly routines: number;
  /** The steps of the hub's other workflows that run it. */
  readonly steps: number;
}

/** A hub a new workflow can go in. */
export interface WorkflowHub {
  readonly id: string;
  readonly name: string;
}

/** What the New workflow dialog hands over. */
export interface NewWorkflow {
  readonly name: string;
  readonly hubId: string;
}
