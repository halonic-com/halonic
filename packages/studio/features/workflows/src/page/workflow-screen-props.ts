import type { SandboxStartCheck } from "@halonicjs/app";
import type { ShownRuns } from "@halonicjs/studio-feature-inbox/api";
import type { RunsSource } from "@halonicjs/studio-feature-runs/api";
import type { SaveState } from "@halonicjs/studio-shell";
import type { WorkflowGuide, WorkflowsHost } from "../api.ts";
import type { AnnounceState } from "../start/run-announcement.ts";

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
  /** Opens Models, at an alias's tab when given one, for **Open Models** on the Run panel's run card; without it the button isn't there. */
  readonly openModels?: (alias?: string) => void;
  /** Opens the workspace page at its Budget block, for **Change budget** on the Run panel's run card; without it the button isn't there. */
  readonly openBudget?: () => void;
  /** Opens the Runs list; absent where the app can't open it. */
  readonly seeAllRuns?: () => void;
  /** Opens the Workflows list, for a workflow that isn't there any more; absent where the app can't open it. */
  readonly goToWorkflows?: () => void;
  /** Opens the Inbox on what the run waits on, for a run card's Review in Inbox; absent where the app can't open it. */
  readonly reviewInInbox?: (runId: string) => void;
  /**
   * The Inbox's runs shown elsewhere: the docked run card notes its run there, so the Inbox doesn't
   * say "Waiting for you" for it while this page shows. Absent where there is no Inbox.
   */
  readonly shownRuns?: ShownRuns | undefined;
  /** Opens the page on Configuration's Tests, as `openItem`'s `step: "tests"` asks; on Flow when absent. */
  readonly startOnTests?: boolean;
  /**
   * How many times the tab was asked for its Tests (`TabLocation.asked`). A page that is open
   * already goes to Tests again when this changes, also when it is asked for the same step twice.
   */
  readonly testsAsked?: number;
  /** Reads a state change to screen readers (`announcer.announceState`); without it nothing is read. */
  readonly announceState?: AnnounceState;
  /**
   * Says a line to a screen reader, politely (`announcer.announce`): why the run card's Run again
   * didn't start, and what Check again found; without it nothing is said.
   */
  readonly announce?: (line: string) => void;
  /** The window's save state, for the toolbar's "1 field not saved"; absent without a window. */
  readonly saving?: Pick<SaveState, "setFieldsNotSaved"> | undefined;
  /**
   * Checks whether the sandbox can start, for a workflow whose steps start a program; where it is
   * absent, Run is never disabled for the sandbox (the engine still refuses such a run).
   */
  readonly sandboxStartCheck?: SandboxStartCheck | undefined;
  /** Opens an agent's page, for the can't-run Callout's "*Writer*'s settings ›"; without it there is no link. */
  readonly openAgent?: (agentId: string) => void;
  /** Another feature's guide card, such as the first run's; without it the page shows none. */
  readonly guide?: WorkflowGuide | undefined;
}
