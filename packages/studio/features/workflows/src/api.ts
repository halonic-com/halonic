/**
 * The services and types other features may use. Features import each other only through this
 * file. The app provides `WorkflowsHostService` for each open workspace; the Workflows feature's
 * list, dialogs and page read it.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** Names one workflow the way a deep link does: its hub and its id. */
export interface WorkflowRef {
  readonly hubId: string;
  readonly id: string;
}

/** What a workflow's row on the Workflows list shows. */
export interface WorkflowListing extends WorkflowRef {
  /** The display name; renaming changes it and keeps the id. */
  readonly name: string;
  /** What the workflow is for, as its file says. The list search reads it; the row doesn't show it. */
  readonly description?: string | undefined;
  /** Problems the checks found, which the row shows as "2 warnings" or "2 problems". */
  readonly problems: { readonly errors: number; readonly warnings: number };
  /** Runs of this workflow that wait for a person, and runs that are still going. */
  readonly runs: { readonly waiting: number; readonly running: number };
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

/**
 * The workspace's workflows, as the app reads and changes them. The app saves to the workspace's
 * files itself, so listing, creating and renaming work while the engine is stopped; only starting
 * a run needs the engine.
 */
export interface WorkflowsHost {
  /** The hubs a workflow can be created in, in the workspace's order. */
  hubs(): readonly WorkflowHub[];
  /** Every workflow in the workspace's hubs. Rejects with the reason it couldn't read them. */
  list(): Promise<readonly WorkflowListing[]>;
  /**
   * Calls `listener` each time the list may have changed (a file saved, a run started or
   * finished); returns the way to stop.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Makes the workflow `start → done` in the hub, with the id taken from its name (`-2` when the
   * id is taken), and returns where it is. Rejects with the reason it couldn't be written.
   */
  create(newWorkflow: NewWorkflow): Promise<WorkflowRef>;
}

/** The open workspace's workflows, provided by the app (`workflows.host`). */
export const WorkflowsHostService: ServiceKey<WorkflowsHost> =
  serviceKey<WorkflowsHost>("workflows.host");
