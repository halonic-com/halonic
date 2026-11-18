/**
 * The services and types other features may use. Features import each
 * other only through this file. The app provides `RunsSourceService` for
 * each open workspace; the Runs list, the run page and Home read it. The
 * Runs feature keeps one `RunsList` per workspace (`RunsListService`) that
 * other features read instead of listing the runs again.
 */
import type { LoggedInstructionPin, RunEvent, RunSummary } from "@halonicjs/events";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

export { type RunChip, type RunRow, runRow, startedBy } from "./list/run-row.ts";
export type { WorkflowRef } from "./list/runs-filter.ts";
export {
  type ApiOff,
  apiOffOf,
  type CurrentApiOff,
  currentApiOffs,
  type GoogleApi,
} from "./run-view/api-off.ts";
export { RunCardReceipt, type RunCardReceiptProps } from "./run-view/card-receipt.tsx";
export { type RunLogRead, useRunLog } from "./run-view/every-step.tsx";
export { RunView } from "./run-view/run-page.tsx";
export { RunsList, RunsListService, type RunsListState } from "./runs-list.ts";

/** One run as the Runs list reads it: its summary. */
export interface SourcedRun {
  readonly summary: RunSummary;
  /**
   * A test run's case, by its `name` in the test file; absent for a real run,
   * and while the run log doesn't record which case started it.
   */
  readonly testCase?: string;
}

/**
 * What `RunsSource.log` throws when it read the log up to a damaged line and
 * no further: the run page shows those events with a banner that names the
 * line (mc 15.2, "Damaged run log").
 */
export class DamagedRunLog extends Error {
  /** The 1-based line of the log file that can't be read. */
  readonly line: number;
  /** The events before it, oldest first. */
  readonly events: RunEvent[];

  constructor(line: number, events: RunEvent[]) {
    super(`Line ${line} of the run log is damaged.`);
    this.name = "DamagedRunLog";
    this.line = line;
    this.events = events;
  }
}

/** What a run's workflow says about it: its name, and the description of each step. */
export interface RunWorkflow {
  readonly name: string;
  /** The step's description as written in the workflow file; `undefined` when it has none. */
  readonly stepDescription: (stateId: string) => string | undefined;
}

/** What the routine that started a run says about it: its name, and when it runs. */
export interface RunRoutine {
  readonly name: string;
  /**
   * Its schedule or interval in `halonic routines`' words, without the time
   * zone: "Weekdays at 08:00", "Every 2 hours (UTC)". `undefined` when the
   * routine no longer runs on a clock.
   */
  readonly schedule: string | undefined;
}

/** Where a model provider runs: on this computer, or elsewhere. */
export type ProviderKind = "local" | "cloud";

/** The runs of one open workspace, as the app provides them. */
export interface RunsSource {
  /** Every run, real and test, newest start first. */
  readonly list: () => Promise<SourcedRun[]>;
  /**
   * One run's whole log, oldest event first, the events `halonic runs show`
   * reads; empty when the run has no log. The run page reads it for Every step.
   * Throws {@link DamagedRunLog} when part of it can't be read.
   */
  readonly log: (runId: string) => Promise<RunEvent[]>;
  /** The run's workflow; `undefined` when it's no longer in the workspace. */
  readonly workflow: (hubId: string, workflowId: string) => RunWorkflow | undefined;
  /** An agent's name as its file says; `undefined` when the workspace has no such agent. */
  readonly agentName?: (agentId: string) => string | undefined;
  /** A hub's name as its file says; `undefined` when the workspace has no such hub. */
  readonly hubName?: (hubId: string) => string | undefined;
  /**
   * The routine with the key a run's `trigger.routineId` holds; `undefined`
   * when it's no longer in the workspace.
   */
  readonly routine: (key: string) => RunRoutine | undefined;
  /**
   * The workflows the workspace has, each as the name `halonic run` takes (`support-reply`, or
   * `support/reply` when two hubs have a `reply`), in the Workflows list's order. Empty when the
   * workspace has none. Rejects when the files can't be read.
   */
  readonly runnableWorkflows: () => Promise<readonly string[]>;
  /**
   * Whether the provider with this id runs on this computer (`local`) or reaches past it
   * (`cloud`), as its file says; the mock model counts as local. `undefined` when the workspace
   * has no such provider. The run page's banners read it to tell a local model from a cloud one.
   */
  readonly providerKind: (providerId: string) => ProviderKind | undefined;
  /** The workspace's currency (`budget.currency`, EUR when it names none). */
  readonly currency: () => string;
  /** The workspace's monthly budget (`budget.monthly`); `undefined` when it sets none. */
  readonly monthlyBudget: () => number | undefined;
  /** Calls `listener` whenever a run starts, changes or ends; returns a function that stops it. */
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * Whether the open folder is the Acme sample, which Home's Recent runs words differently. The app
 * provides it for each open folder; without it no workspace counts as the sample. The First Run
 * feature owns the same fact, but it builds on this one, so this is its own small key.
 */
export const SampleHintService: ServiceKey<{ isSample(): boolean }> = serviceKey<{
  isSample(): boolean;
}>("runs.sample-hint");

/** The open workspace's runs. The app provides it for each open workspace. */
export const RunsSourceService: ServiceKey<RunsSource> = serviceKey<RunsSource>("runs.source");

/**
 * What the shell's native question came to (see `InstructionTrustHostService`): `trusted` when the
 * person said yes and the instructions are saved, `declined` when they said no, `busy` while
 * another question is open, `unavailable` when nothing could be asked or saved.
 */
export type InstructionTrustAnswer = "trusted" | "declined" | "busy" | "unavailable";

/**
 * The way past a refused harness start: asks the person, in the shell's own dialog, whether to
 * trust one agent's instructions in the open workspace. The page only asks; the shell writes the
 * record when the person says yes. The app provides it only where the shell can ask: a served
 * page or a phone has none, and the run page then says to trust on the computer first.
 */
export interface InstructionTrustHost {
  /**
   * Asks about the instructions `pin` describes (the pin `run.failed` carried) for `agent`.
   * Never rejects: a failure is `unavailable`.
   */
  readonly trust: (agent: string, pin: LoggedInstructionPin) => Promise<InstructionTrustAnswer>;
}

/** The open workspace's way to trust an agent's instructions. Absent where the shell can't ask. */
export const InstructionTrustHostService: ServiceKey<InstructionTrustHost> =
  serviceKey<InstructionTrustHost>("runs.instruction-trust-host");

/**
 * The way to start a run of a workflow, for **Run again** on the run page. The app provides it
 * where it has an engine; a served page has none, and the page then shows no **Run again**.
 */
export interface RunStartHost {
  /**
   * Starts a run of the workflow with `input` on what is saved in the workspace, and returns the
   * new run's id once it has started. Rejects with the reason it didn't start.
   */
  readonly startRun: (
    workflow: { readonly hubId: string; readonly workflowId: string },
    input: Record<string, unknown>,
  ) => Promise<{ readonly runId: string }>;
}

/** The open workspace's way to start a run. Absent where there is no engine to start it. */
export const RunStartHostService: ServiceKey<RunStartHost> =
  serviceKey<RunStartHost>("runs.start-host");

/**
 * Whether the open workspace keeps versions, for the run page's Ran on row: a workspace with no
 * version history leaves it out rather than say "Version not recorded." on every run (HAL-12727).
 */
export interface VersionHistoryHost {
  /** Whether the workspace has at least one version. Rejects when its history can't be read. */
  readonly hasVersions: () => Promise<boolean>;
}

/** The open workspace's version history. Absent where the app can't read it; Ran on then shows. */
export const VersionHistoryHostService: ServiceKey<VersionHistoryHost> =
  serviceKey<VersionHistoryHost>("runs.version-history-host");
