import type { RunsSource } from "@halonicjs/studio-feature-runs/api";
import type { WorkflowsHost } from "../api.ts";

/** Props for `WorkflowScreen`. */
export interface WorkflowScreenProps {
  readonly host: WorkflowsHost;
  /** The workspace's runs, which the Runs view shows the real ones of. */
  readonly runs: RunsSource;
  readonly hubId: string;
  readonly id: string;
  /** Why a start failed when the engine can't be reached, in the words for where Studio runs; the desktop app's when absent. */
  readonly notAnswering?: string;
  /** Opens a test run's card from the Tests page; absent where there is no run card. */
  readonly openRun?: (runId: string, step?: string) => void;
  /** Opens the Runs list; absent where the app can't open it. */
  readonly seeAllRuns?: () => void;
  /** Opens the Workflows list, for a workflow that isn't there any more; absent where the app can't open it. */
  readonly goToWorkflows?: () => void;
  /** Opens the Inbox, for a run card's Review in Inbox; absent where the app can't open it. */
  readonly reviewInInbox?: () => void;
  /** Opens the page on Configuration's Tests, as `openItem`'s `step: "tests"` asks; on Flow when absent. */
  readonly startOnTests?: boolean;
  /**
   * How many times the tab was asked for its Tests (`TabLocation.asked`). A page that is open
   * already goes to Tests again when this changes, also when it is asked for the same step twice.
   */
  readonly testsAsked?: number;
}
