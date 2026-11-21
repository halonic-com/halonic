import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { PageRuns } from "../engine/page-refusal.ts";

/** What `WorkspaceWorkflows` needs of the workspace's files, events and runs. */
export interface WorkspaceWorkflowsParts {
  /** The kernel's `WorkspaceFiles`: reads with unsaved changes applied, and changes as one undo step. */
  readonly files: {
    read(path: string): Promise<string | null>;
    list(dir: string): Promise<string[]>;
    change(label: string, changes: Record<string, string | null>): void;
    /** The kernel's `WorkspaceFiles.undo`: `false` when there was nothing to undo. */
    undo(): boolean;
    /** The kernel's `WorkspaceFiles.step`: moves on every change, so it tells a step is still the newest. */
    readonly step: number;
  };
  /**
   * Resolves once nothing is unsaved, ending a pending save at once instead of waiting out its
   * pause; rejects when the save fails. `startRun` waits for it, so a run starts on what is on disk.
   * Absent where nothing is saved by itself: the run then starts at once.
   */
  readonly settle?: () => Promise<void>;
  /** The workspace folder's absolute path, which the commands to copy name (D1, HAL-12725). */
  readonly folder?: string;
  /** Calls `listener` after every change of the workspace's files; returns the way to stop. */
  readonly onChange: (listener: () => void) => () => void;
  /** The workspace's runs, which the rows count, and the way to hear one start, move on or end. */
  readonly runs: {
    list(): Promise<readonly { readonly summary: RunSummary }[]>;
    subscribe(listener: () => void): () => void;
    /** One run's whole log, oldest event first; empty when the run has no log. */
    log(runId: string): Promise<readonly RunEvent[]>;
  };
  /**
   * Opens the window's trust check, for a start refused because the workspace isn't trusted yet.
   * Absent: the Run panel offers only **Try again**.
   */
  readonly askTrust?: () => Promise<"trusted" | "declined">;
  /**
   * The page's engine, which starts a run. Absent where the page has no engine, so the host has no
   * `startRun` and the page shows no **Run**.
   */
  readonly engine?: {
    startRun(
      run: { readonly hubId: string; readonly workflowId: string },
      input: Record<string, unknown>,
    ): Promise<{ readonly id: string }>;
    /** What it can start: an agent in a harness program, and a run's `stdio` connectors. */
    readonly pageRuns: PageRuns;
  };
}
