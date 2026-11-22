import type { RunSummary } from "@halonicjs/events";
import type { RoutineVersionsAt } from "../changes/workspace-liveness.ts";
import type { RoutineRunStart } from "../engine/engine-service.ts";
import type { StoredSkip } from "./routine-reads.ts";

/** What `WorkspaceRoutines` needs of the workspace's files, runs, clock and engine. */
export interface WorkspaceRoutinesParts {
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
  /** Calls `listener` after every change of the workspace's files; returns the way to stop. */
  readonly onChange: (listener: () => void) => () => void;
  /** The workspace's runs, which the rows and the Runs view read, and the way to hear one change. */
  readonly runs: {
    list(): Promise<readonly { readonly summary: RunSummary }[]>;
    subscribe(listener: () => void): () => void;
  };
  /** The time zone of a schedule that names none: the computer's own, as the scheduler has it. */
  readonly timeZone: string;
  readonly now: () => Date;
  /** Whether the workspace is trusted; routines wait until it is. Trusted when absent. */
  readonly trusted?: () => Promise<boolean>;
  /**
   * Opens the window's trust check, for a Run now refused as not trusted. Absent: the refusal only
   * says so.
   */
  readonly askTrust?: () => Promise<"trusted" | "declined">;
  /** The times the scheduler dropped for a routine, by its key; none when absent. */
  readonly skips?: (key: string) => Promise<readonly StoredSkip[]>;
  /** Calls `listener` each time the scheduler adds to a routine's skips, which starts no run. */
  readonly onSkips?: (listener: () => void) => () => void;
  /**
   * Reads the live version once, then gives the routine at a path from the workspace folder as that
   * version has it and as it is saved (core's `routineVersions`). Without it a routine counts as
   * live and unchanged.
   */
  readonly liveness?: () => Promise<RoutineVersionsAt>;
  /** Hears why a list fell back to the saved files; the console when absent. */
  readonly reportError?: (error: unknown) => void;
  /**
   * Opens Create version with only `paths` in it (source control's `VersionDialogService`), and
   * answers once a version is made or the dialog is closed. With `name`, the dialog says it makes
   * that item live. Absent where the app can't offer that, so there is no `makeLive`.
   */
  readonly versionDialog?: (
    paths: readonly string[],
    options?: { readonly name?: string },
  ) => Promise<"made" | "cancelled">;
  /**
   * Starts what a routine runs, as the scheduler would start it. Absent where the app has no
   * engine, so there is no `runNow`. Rejects with `WindowCantStart` or `StartRefused` for what
   * the window can't start, with the engine's `InputRefused` for an input it can't take, and with
   * the shell's `EngineNotAnswering` when the engine can't be reached.
   */
  readonly engine?: {
    start(
      start: RoutineRunStart,
      trigger: { readonly routineKey: string; readonly at: string },
    ): Promise<{ readonly id: string }>;
  };
}
