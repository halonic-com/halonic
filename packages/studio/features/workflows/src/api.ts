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
  /** What the workflow is for, as its file says. The row shows it under the name, and the list search reads it. */
  readonly description?: string | undefined;
  /** Problems the checks found, which the row shows as "2 warnings" or "2 problems". */
  readonly problems: { readonly errors: number; readonly warnings: number };
  /** Runs of this workflow that wait for a person, and runs that are still going. */
  readonly runs: { readonly waiting: number; readonly running: number };
  /** The newest run of this workflow, as the row's Last run shows it; absent when it has never run. */
  readonly lastRun?: WorkflowLastRun | undefined;
}

/** How a run of a workflow stands: still going, waiting for a person, done, failed or not tried. */
export type WorkflowRunOutcome = "running" | "waiting" | "completed" | "failed" | "cant-try";

/** The newest run of a workflow. */
export interface WorkflowLastRun {
  /** ISO time the run started. */
  readonly startedAt: string;
  readonly outcome: WorkflowRunOutcome;
}

/** What a step does: run an agent, wait for a person, end, or run another workflow or several agents. */
export type WorkflowStepType = "task" | "wait" | "final" | "workflow" | "parallel" | "foreach";

/** One step of a workflow, as its card shows it. */
export interface WorkflowStep {
  readonly id: string;
  readonly type: WorkflowStepType;
  /** The agent a task step runs; `undefined` when it has none (the step passes the data on). */
  readonly agent?: string | undefined;
}

/** One arrow between two steps. */
export interface WorkflowArrow {
  readonly from: string;
  readonly to: string;
  /** The words on the arrow, when the file gives some. */
  readonly label?: string | undefined;
}

/** One workflow as its page draws it. */
export interface WorkflowView extends WorkflowRef {
  readonly name: string;
  /** The id of the first step. */
  readonly initial: string;
  /** The steps in the file's order. */
  readonly steps: readonly WorkflowStep[];
  readonly arrows: readonly WorkflowArrow[];
  /** Where a person put steps on the canvas; a step not in it takes the automatic place. */
  readonly layout: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
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
  /** One workflow as its page draws it. Rejects with the reason it couldn't be read, or when it isn't there. */
  read(ref: WorkflowRef): Promise<WorkflowView>;
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
