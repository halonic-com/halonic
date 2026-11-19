/**
 * The services and types other features may use. Features import each other only through this
 * file. The app provides `WorkflowsHostService` for each open workspace; the Workflows feature's
 * list, dialogs and page read it.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * What {@link WorkflowsHost.startRun} rejects with when the engine can't be reached: the shell's
 * error, which every page words for where Studio runs.
 */
export { EngineNotAnswering } from "@halonicjs/studio-shell";

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
  /** The step's own words for itself (the first line of its description); `undefined` when it has none. */
  readonly title?: string | undefined;
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

/** One problem the checks found in a workflow. */
export interface WorkflowProblem {
  readonly severity: "error" | "warning";
  /** The check that found it, such as `dead-end`; the page writes the short line from it. */
  readonly code: string;
  /** The core's own message, which the page shows in full where the short line has no room. */
  readonly message: string;
  /** The step it is about; absent when it is about the whole workflow. */
  readonly stepId?: string | undefined;
}

/**
 * One input of the request form, as the workflow file says it. The file does not carry a type or a
 * required flag yet, so both are absent until the format does.
 */
export interface WorkflowRequestField {
  readonly name: string;
  readonly type?: "email" | "text" | "long-text" | undefined;
  readonly required?: boolean | undefined;
}

/** What the workflow offers in the Inbox as a request: the title of its form and its inputs. */
export interface WorkflowRequest {
  readonly label: string;
  readonly fields: readonly WorkflowRequestField[];
}

/** One workflow as its Configuration page shows it. */
export interface WorkflowConfiguration extends WorkflowRef {
  readonly name: string;
  readonly description?: string | undefined;
  /** The id of the first step. */
  readonly initial: string;
  /** The ids of the steps, in the file's order, for the first step's choice. */
  readonly stepIds: readonly string[];
  /** The file's path from the workspace folder. */
  readonly file: string;
  /** Present when the workflow is offered in the Inbox as a request. */
  readonly request?: WorkflowRequest | undefined;
  /** Errors first is the page's job; the host gives them as the checks found them. */
  readonly problems: readonly WorkflowProblem[];
}

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
  /** One workflow as its Configuration page shows it. Rejects like {@link WorkflowsHost.read}. */
  configuration(ref: WorkflowRef): Promise<WorkflowConfiguration>;
  /** The workflow's test cases with their last results. Rejects like {@link WorkflowsHost.read}. */
  tests(ref: WorkflowRef): Promise<WorkflowTests>;
  /**
   * Runs the workflow's tests on what's saved, and calls `onResult` with each case's name as its
   * result comes in. Absent while the app can't run them, so the page shows no **Run tests**.
   * Rejects with the reason they couldn't run.
   */
  runTests?(
    ref: WorkflowRef,
    onResult: (index: number, passed: boolean) => void,
  ): Promise<WorkflowTests>;
  /**
   * Starts a run of the workflow through the engine with `input` as the run's input, and returns
   * the new run's id. The run is what is saved in the workspace now: the engine runs the saved
   * files. Studio saves by itself, so this differs from what the page shows only while a save is
   * pending or a field has a mistake; the host saves what is waiting at once and then starts the run,
   * and never saves a field that has a mistake (HAL-10348). Absent while the app has no engine
   * to start it, so the page shows no **Run**. Rejects with {@link EngineNotAnswering} when the
   * engine can't be reached, or with the reason it didn't start, which includes a save that failed.
   */
  startRun?(ref: WorkflowRef, input: Record<string, unknown>): Promise<{ readonly runId: string }>;
  /**
   * Saves the real run `runId` as a test case called `name` in the workflow's test file: the run's
   * input, and the step it ended in as the step the case expects. Absent while the app can't write
   * test cases, so the run card shows no **Save as test**. Rejects with the reason it couldn't be
   * written, and rejects a name another test case already has.
   */
  saveRunAsTest?(ref: WorkflowRef, runId: string, name: string): Promise<void>;
  /**
   * The name of a workflow the host has read or made, for a tab or a page title, or `undefined`
   * before it has read it. Sync, because a tab is named the moment it opens.
   */
  nameOf(ref: WorkflowRef): string | undefined;
  /**
   * Calls `listener` each time the list may have changed (a file saved, a run started or
   * finished, or `nameOf` knows a new name); returns the way to stop.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Gives the workflow a new display name, as one undoable change that saves itself. The id, the
   * file and every routine or step that runs it stay as they are. Absent while the app can't change
   * the workflow's file, so the page shows the name as a title, not a field. Rejects a name another
   * workflow in the hub has, or with the reason the file couldn't be changed.
   */
  rename?(ref: WorkflowRef, name: string): Promise<void>;
  /**
   * Makes the workflow `start → done` in the hub, with the id taken from its name (`-2` when the
   * id is taken), and returns where it is. Rejects with the reason it couldn't be written.
   */
  create(newWorkflow: NewWorkflow): Promise<WorkflowRef>;
}

/** The open workspace's workflows, provided by the app (`workflows.host`). */
export const WorkflowsHostService: ServiceKey<WorkflowsHost> =
  serviceKey<WorkflowsHost>("workflows.host");
