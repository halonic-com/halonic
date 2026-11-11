/**
 * The services and types other features may use. Features import each
 * other only through this file. The app provides `RunsSourceService` for
 * each open workspace; the Runs list, the run page and Home read it.
 */
import type { RunSummary } from "@halonicjs/events";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

export { type RunChip, type RunRow, runRow } from "./list/run-row.ts";

/** One run as the Runs list reads it: its summary, and the one fact the summary doesn't hold. */
export interface SourcedRun {
  readonly summary: RunSummary;
  /**
   * Whether the run's log has a tool call (`RunHistory.madeToolCalls`). A
   * run "sent nothing" only when it made none (cli-output 3.4).
   */
  readonly madeToolCalls: boolean;
}

/** What a run's workflow says about it: its name, and the description of each step. */
export interface RunWorkflow {
  readonly name: string;
  /** The step's description as written in the workflow file; `undefined` when it has none. */
  readonly stepDescription: (stateId: string) => string | undefined;
}

/** The runs of one open workspace, as the app provides them. */
export interface RunsSource {
  /** Every run, real and test, newest start first. */
  readonly list: () => Promise<SourcedRun[]>;
  /** The run's workflow; `undefined` when it's no longer in the workspace. */
  readonly workflow: (hubId: string, workflowId: string) => RunWorkflow | undefined;
  /** The workspace's currency (`budget.currency`, EUR when it names none). */
  readonly currency: () => string;
  /** Calls `listener` whenever a run starts, changes or ends; returns a function that stops it. */
  readonly subscribe: (listener: () => void) => () => void;
}

/** The open workspace's runs. The app provides it for each open workspace. */
export const RunsSourceService: ServiceKey<RunsSource> = serviceKey<RunsSource>("runs.source");
