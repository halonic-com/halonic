/**
 * The services and types other features may use. Features import each other only through this
 * file. The app provides `WorkflowsHostService` for each open workspace; the Workflows feature's
 * list, dialogs and page read it.
 */

import { errorKindOf, KindedError } from "@halonicjs/std";
import type { TryItChanges } from "@halonicjs/studio-feature-agents/api";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { NewWorkflow, TrashedWorkflow, WorkflowHub, WorkflowUsers } from "./lifecycle-api.ts";
import type { WorkflowTests } from "./tests-api.ts";

/**
 * What {@link WorkflowsHost.startRun} rejects with when the engine can't be reached: the shell's
 * error, which every page words for where Studio runs.
 */
export { EngineNotAnswering } from "@halonicjs/studio-shell";
export {
  RUN_FORM_STEP,
  type WorkflowGuide,
  type WorkflowGuideCard,
  type WorkflowGuideLine,
  type WorkflowGuidePage,
  type WorkflowGuideRun,
  type WorkflowGuideScreen,
  type WorkflowGuideScreenProps,
  WorkflowGuideService,
} from "./guide-api.ts";

import type {
  RemovedStep,
  WorkflowArrowChange,
  WorkflowArrowFieldChange,
  WorkflowRemoval,
} from "./workflow-edits.ts";

/** The changes the step card asks of the host for arrows, and what a removal hands back. */
export type { RemovedStep, WorkflowArrowChange, WorkflowArrowFieldChange, WorkflowRemoval };

/**
 * Why Studio can't start a run, and the next step (rules N1 to N3 of the UX check, HAL-12363): a
 * step in Studio, such as "Set Reporter to Halonic on its Harness page to run it now.", or the
 * sentence that leads to the whole command, filled in, to copy.
 */
export interface StartRefusal {
  /** Why Studio doesn't start it, such as "Reporter uses a connector, which Studio can't start yet." */
  readonly reason: string;
  /** The next step, or the sentence before the command, such as "To start it, run this in a terminal:". */
  readonly fix: string;
  /** The command that starts the run in a terminal; absent when the next step is in Studio. */
  readonly command?: string | undefined;
}

/**
 * What {@link WorkflowsHost.startRun} rejects with when Studio can't start the run: an
 * `unavailable` error whose `fix` is the next step and whose `command`, when there is one, is the
 * command to copy, so the page can put it in a CommandBox. Starting again can't help.
 */
export class StartRefused extends KindedError {
  readonly command: string | undefined;
  constructor({ reason, fix, command }: StartRefusal) {
    super("unavailable", reason, { fix });
    this.command = command;
  }
}

/** The refusal an error holds: an `unavailable` error with a `fix`, and maybe a `command`. */
export function startRefusalOf(error: unknown): StartRefusal | undefined {
  if (errorKindOf(error) !== "unavailable") return undefined;
  const { message, fix, command } = error as { message: string; fix?: unknown; command?: unknown };
  if (typeof fix !== "string") return undefined;
  return {
    reason: message,
    fix,
    command: typeof command === "string" && command !== "" ? command : undefined,
  };
}

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

/**
 * What a step does: run an agent, wait for a person, end, run another workflow or several agents,
 * or run a rule of the hub or call a connector's tool, each with no model.
 */
export type WorkflowStepType =
  | "task"
  | "wait"
  | "final"
  | "workflow"
  | "parallel"
  | "foreach"
  | "rule"
  | "tool";

/** One step of a workflow, as its card shows it. */
export interface WorkflowStep {
  readonly id: string;
  readonly type: WorkflowStepType;
  /** The step's own words for itself (the first line of its description); `undefined` when it has none. */
  readonly title?: string | undefined;
  /** The agent a task step runs; `undefined` when it has none (a run fails at the step). */
  readonly agent?: string | undefined;
  /** The step's whole description, as its docked card edits it; `undefined` when it has none. */
  readonly description?: string | undefined;
  /**
   * What the step's agent is asked, when the file gives it as text; `undefined` when it has none.
   * A prompt given as data (a mapping) isn't text, so it is `undefined` too, and `promptIsData` says so.
   */
  readonly prompt?: string | undefined;
  /** The file gives the prompt as data, which the docked card can't edit as text. */
  readonly promptIsData?: boolean | undefined;
  /** The name later steps pick the step's output by (`output`, **Save output as**); `undefined` when it has none. */
  readonly output?: string | undefined;
  /**
   * The first agent the step runs in a program that needs the sandbox (Claude Code or Codex): its
   * own, a branch's, or one of a workflow it starts. `undefined` when every agent it runs is in
   * Halonic's own loop, or it runs none.
   */
  readonly program?: WorkflowStepProgram | undefined;
}

/**
 * One change of a step from its docked card. Each field that is present is set; an empty text
 * removes it from the file.
 */
export interface WorkflowStepChange {
  /** The step's kind. The file keeps the keys of the old kind, so changing back finds them. */
  readonly type?: WorkflowStepType;
  /** The agent the step runs, by its id in the hub; empty for none. */
  readonly agent?: string;
  readonly description?: string;
  readonly prompt?: string;
  readonly output?: string;
}

/** An agent a step runs in a program of its own, as the can't-run Callout names it. */
export interface WorkflowStepProgram {
  /** The agent's id in the workflow's hub. */
  readonly agent: string;
  /** The agent's name, as its page shows it. */
  readonly agentName: string;
  readonly harness: "claude-code" | "codex" | "opencode";
}

/** One arrow between two steps. */
export interface WorkflowArrow {
  readonly from: string;
  readonly to: string;
  /** The words on the arrow, when the file gives some. */
  readonly label?: string | undefined;
  /** The event that fires it; absent for `done`, when the step's work finishes. */
  readonly event?: string | undefined;
  /** A wait step's timer ("2d"): the arrow fires when nothing else happened in that time. */
  readonly after?: string | undefined;
  /** The condition on the run's data (the file's `when`), as the file gives it; absent for none. */
  readonly condition?: unknown;
}

/** One workflow as its page draws it. */
export interface WorkflowView extends WorkflowRef {
  readonly name: string;
  /** The id of the first step. */
  readonly initial: string;
  /** The steps in the file's order. */
  readonly steps: readonly WorkflowStep[];
  /** Every step's arrows, step by step in the file's order, each step's in the order its file lists them. */
  readonly arrows: readonly WorkflowArrow[];
  /** Where a person put steps on the canvas; a step not in it takes the automatic place. */
  readonly layout: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
  /**
   * The agents of the workflow's hub, which a step can run, for the docked card's **Agent**
   * picker. Absent is none.
   */
  readonly agents?: readonly WorkflowAgentChoice[] | undefined;
}

/** An agent a step can run. */
export interface WorkflowAgentChoice {
  /** What the step's file names it by. */
  readonly id: string;
  readonly name: string;
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
  /** The agent whose file it is in, for an error of an agent a step names; absent for the workflow's own file. */
  readonly agent?: WorkflowAgentChoice | undefined;
  /** For `unknown-model-alias`: the alias the agent or its agent step names, which the workspace doesn't have. */
  readonly modelAlias?: string | undefined;
  /**
   * The path of the file it is in, from the workspace folder, when that isn't the workflow's own
   * file: another file whose error stops the workflow's run, such as an agent's it uses.
   */
  readonly file?: string | undefined;
  /**
   * The step's arrow it is in, by its place among the step's arrows (the file's order, from 0, as
   * `arrows` lists them); absent when it isn't in one of the step's arrows.
   */
  readonly arrowIndex?: number | undefined;
  /** For `unknown-model-alias` on an agent step's model (`methods.<id>.model`): that agent step's name. */
  readonly agentStep?: string | undefined;
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

export type { NewWorkflow, TrashedWorkflow, WorkflowHub, WorkflowUsers } from "./lifecycle-api.ts";
export { type WorkflowReviewHost, WorkflowReviewService } from "./review-api.ts";
export type { WorkflowTestCase, WorkflowTestResult, WorkflowTests } from "./tests-api.ts";

/**
 * The workspace's workflows, as the app reads and changes them. The app saves to the workspace's
 * files itself, so listing, creating and renaming work while the engine is stopped; only starting
 * a run needs the engine.
 */
export interface WorkflowsHost {
  /**
   * The workspace folder's absolute path, which the commands to copy name with `--dir` (D1,
   * HAL-12725); absent where the app gives none, and the commands then name no folder.
   */
  readonly folder?: string | undefined;
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
   * result comes in. Absent while the app can't run them, so the page shows the command that
   * runs them in a terminal in place of **Run tests**.
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
   * engine can't be reached, with {@link StartRefused} when Studio can't start it but a person can, or
   * with the reason it didn't start, which includes a save that failed.
   */
  startRun?(ref: WorkflowRef, input: Record<string, unknown>): Promise<{ readonly runId: string }>;
  /**
   * Opens the workspace's trust check, for a start refused because the workspace isn't trusted yet
   * (a `denied` refusal), and answers `"trusted"` once the person trusted it, `"declined"` on Not
   * now. Absent where there is no folder to trust, so the Run panel offers **Try again**.
   */
  askTrust?(): Promise<"trusted" | "declined">;
  /**
   * Calls `listener` whenever the workspace may run now, wherever the person trusted it (the
   * status bar's **Review**, too, not only the Run panel's), and returns how to stop. Absent where
   * there is no folder to trust.
   */
  onTrusted?(listener: () => void): () => void;
  /**
   * Why {@link WorkflowsHost.startRun} would refuse the workflow, as far as its files say before
   * **Run** is pressed, with the unsaved changes applied: what {@link StartRefused} carries, or
   * `undefined` when nothing in the files stops it. The page then shows **Run** unavailable with
   * these lines under it (rule N5 of the UX check, HAL-12363). Absent with `startRun`.
   */
  startRefusal?(ref: WorkflowRef): Promise<StartRefusal | undefined>;
  /**
   * Watches the assistant's changes to review that Test uses and leaves out for this workflow
   * (flow-assistant 4.4); returns the way to stop. Absent where there are none (the browser).
   */
  watchTryItChanges?(ref: WorkflowRef, listener: (changes: TryItChanges) => void): () => void;
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
   * Adds an agent step `step-1` (`task`) or a wait step `wait-1` to the workflow, the next free
   * number when that one is taken, placed at `at` on the canvas, as one undoable change that saves itself; resolves to the
   * new step's id. It has no arrows of its own. Given `from`, the picked step, the same change adds
   * an arrow from it to the new step, on done, after its other arrows, unless `from` ends the
   * workflow or already has an on-done arrow without a condition, which would always fire first.
   * Absent while the app can't change the workflow's file, so the canvas shows no toolbar. Rejects
   * with the reason the file couldn't be changed, and a `from` that isn't there; then nothing is
   * written.
   */
  addStep?(
    ref: WorkflowRef,
    type: "task" | "wait",
    at: { readonly x: number; readonly y: number },
    from?: string,
  ): Promise<string>;
  /**
   * Forgets where a person put the steps, so every step takes the automatic place again (**Auto
   * layout**), as one undoable change. Present whenever {@link WorkflowsHost.addStep} is.
   */
  resetLayout?(ref: WorkflowRef): Promise<void>;
  /**
   * Gives the workflow a new display name, as one undoable change that saves itself. The id, the
   * file and every routine or step that runs it stay as they are. Absent while the app can't change
   * the workflow's file, so the page shows the name as a title, not a field. Rejects a name another
   * workflow in the hub has, or with the reason the file couldn't be changed.
   */
  rename?(ref: WorkflowRef, name: string): Promise<void>;
  /**
   * Changes one step of the workflow, as one undoable change that saves itself; the file keeps its
   * comments and the order of its keys. Absent while the app can't change the workflow's file, so
   * the canvas opens no card to edit a step. Rejects with the reason the file couldn't be changed,
   * a step that isn't there, and a prompt the file gives as data.
   */
  changeStep?(ref: WorkflowRef, stepId: string, change: WorkflowStepChange): Promise<void>;
  /**
   * Moves the workflow's file and its test files to the trash as one change, with no dialog.
   * Routines and steps that run it are left as they are and show an error until they name another
   * workflow. Absent while the app can't change the workflow's files, so the page has no ⋮.
   * Rejects with `not_found` when the workflow isn't there, and with the reason it couldn't.
   */
  trash?(ref: WorkflowRef): Promise<TrashedWorkflow>;
  /**
   * What runs the workflow, for the warning after its delete. Present whenever
   * {@link WorkflowsHost.trash} is. Rejects with the reason the workspace couldn't be read.
   */
  referencesTo?(ref: WorkflowRef): Promise<WorkflowUsers>;
  /**
   * Adds or moves one arrow out of the step `stepId`, as one undoable change that saves itself; the
   * file keeps its comments. Present whenever {@link WorkflowsHost.changeStep} is. Rejects a step
   * that isn't there, an end step, an arrow to a step that isn't there, an arrow that can't move
   * that way or no longer goes where the card showed it, or with the reason the file couldn't be
   * changed.
   */
  changeArrows?(ref: WorkflowRef, stepId: string, change: WorkflowArrowChange): Promise<void>;
  /**
   * Takes the step `stepId` out of the workflow, with its place on the canvas, its own arrows and
   * every arrow into it, as one undoable change that saves itself; the file keeps its comments.
   * Present whenever {@link WorkflowsHost.changeStep} is. Rejects the first step (`conflict`, until
   * another is picked), a step that isn't there, or with the reason the file couldn't be changed.
   */
  removeStep?(ref: WorkflowRef, stepId: string): Promise<RemovedStep>;
  /**
   * Takes the arrow at `index` (in file order, from 0) out of the step `stepId`, as one undoable
   * change that saves itself; the file keeps its comments. `to` is where that arrow goes as the
   * card showed it, so a card that is out of date can't remove another arrow. Present whenever
   * {@link WorkflowsHost.changeStep} is. Rejects a step or an arrow that isn't there, one that no
   * longer goes to `to`, or with the reason the file couldn't be changed.
   */
  removeArrow?(
    ref: WorkflowRef,
    stepId: string,
    index: number,
    to: string,
  ): Promise<WorkflowRemoval>;
  /**
   * Makes the workflow `start → done` in the hub, with the id taken from its name (`-2` when the
   * id is taken), and returns where it is. Rejects with the reason it couldn't be written.
   */
  create(newWorkflow: NewWorkflow): Promise<WorkflowRef>;
}

/** The open workspace's workflows, provided by the app (`workflows.host`). */
export const WorkflowsHostService: ServiceKey<WorkflowsHost> =
  serviceKey<WorkflowsHost>("workflows.host");
