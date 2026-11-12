// The versions of a workspace an engine's runs read, as `halonic routines
// watch` gives them to the engine (HAL-6084, HAL-7500).

import type { RunDefinitions } from "@halonicjs/engine";
import type { RunVersion } from "@halonicjs/events";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { TrustedVersion } from "./local-run-connectors.ts";

/** The versions of a workspace an engine's runs read, as {@link LocalEngineInput.versions} says. */
export interface WorkspaceVersions {
  /**
   * The version read last, checked and trusted as `workspace` is. The
   * executor keeps the `privacy.localOnly` of `workspace`, so a version
   * that changes it must not be given here.
   */
  latest(): LoadedWorkspace;
  /**
   * The definitions a new run of the workflow starts with, from `version`:
   * the start's, which the run records.
   *
   * @throws when the hub or the workflow isn't in that version, or that
   *   version may not run on this computer
   */
  definitionsOf(
    hubId: string,
    workflowId: string,
    version: RunVersion | undefined,
    runId: string,
  ): Promise<RunDefinitions>;
  /**
   * The version a run read, as its connectors start from it, with the
   * grant of its trust check, checked again. For a run this engine started,
   * the load its definitions came from; for one it didn't, its recorded
   * version, loaded now.
   *
   * @throws when that version can't be read or may not run on this computer
   */
  trustedVersionOf(run: {
    readonly runId: string;
    readonly version: RunVersion;
  }): Promise<TrustedVersion>;
  /** Forgets what is kept for a run that has ended. */
  forget(runId: string): void;
}
