// The versions `halonic routines watch` and `halonic serve` start their
// routines' runs from: the workspace engine's `WatchedVersions` (HAL-17054),
// with its refusals in the CLI's words. What each version passes, and when,
// is said there.

import {
  WatchedVersions as EngineWatchedVersions,
  type TrustedVersion,
  type VersionChecks,
} from "@halonicjs/adapter-workspace-engine-node";
import type { LiveRoutines } from "@halonicjs/app";
import type { RunDefinitions } from "@halonicjs/engine";
import type { RunVersion } from "@halonicjs/events";
import type { LoadedFileOf, LoadedWorkspace } from "@halonicjs/workspace";
import { type OpenWorkspaceHistory, openGitHistory } from "../../run-workspace.ts";
import { inCliWords } from "../../version-refusal-words.ts";
import type { WorkspaceAtVersion } from "../../workspace-at-version.ts";
import type { OpenWorkspaceDir } from "../../workspace-dir.ts";
import type { WorkspaceVersions } from "../../workspace-versions.ts";

export type { VersionChecks } from "@halonicjs/adapter-workspace-engine-node";

/**
 * The versions of one watch, open until {@link WatchedVersions.close}: the
 * engine's, each refusal worded as the CLI says it.
 *
 * @example
 * const versions = await WatchedVersions.open(dir, setup.history);
 * try {
 *   const first = versions.latest(); // check trust and the sandbox on it
 *   versions.checkWith(checks);
 *   // the engine: { workspace: first, versions }, its scheduler on versions.routines
 * } finally {
 *   await versions.close();
 * }
 */
export class WatchedVersions implements WorkspaceVersions {
  /** The routine scheduler's routines, targets and versions, as the Studio's reads them. */
  readonly routines: LiveRoutines;
  readonly #versions: EngineWatchedVersions;
  /** The workspace's folder name, for the line about local only. */
  readonly #name: string;

  private constructor(versions: EngineWatchedVersions, name: string) {
    this.#versions = versions;
    this.#name = name;
    this.routines = versions.routines;
  }

  /**
   * Opens the workspace's history and reads the version the watch starts
   * from: the live version, or the saved files with history off.
   *
   * @throws HistoryUnavailableError when the workspace has history but git can't start (exit 9)
   * @throws OwnLineError `conflict` when the workspace has history but nothing is live yet
   */
  static async open(
    dir: OpenWorkspaceDir,
    openHistory: OpenWorkspaceHistory = openGitHistory,
  ): Promise<WatchedVersions> {
    const versions = await worded(dir.name, () => EngineWatchedVersions.open(dir, openHistory));
    return new WatchedVersions(versions, dir.name);
  }

  /** The version read last: the first one, until a run starts from a newer one. */
  latest(): LoadedWorkspace {
    return this.#versions.latest();
  }

  /** {@link latest} with its local integrations, for its trust check. */
  latestVersion(): WorkspaceAtVersion {
    return this.#versions.latestVersion();
  }

  /** The live version as it is now, as the engine's {@link EngineWatchedVersions.live} reads it. */
  async live(): Promise<LoadedWorkspace> {
    return await worded(this.#name, () => this.#versions.live());
  }

  /** {@link live} with its local integrations, for a trust check of the version runs start from now. */
  async liveVersion(): Promise<WorkspaceAtVersion> {
    return await worded(this.#name, () => this.#versions.liveVersion());
  }

  /** The live version, only if a run could start from it; else `null`. */
  async trustedLive(): Promise<LoadedWorkspace | null> {
    return await worded(this.#name, () => this.#versions.trustedLive());
  }

  /** The routine files of `saved` whose changes aren't live yet. */
  async routinesNotLive(saved: LoadedWorkspace): Promise<LoadedFileOf<"routine">[]> {
    return await worded(this.#name, () => this.#versions.routinesNotLive(saved));
  }

  /** Sets the checks each later run's version passes first; until then, none, and no grant. */
  checkWith(checks: VersionChecks): void {
    this.#versions.checkWith(checks);
  }

  /** @throws when the version changes local only, fails its check, or has no such workflow */
  async definitionsOf(
    hubId: string,
    workflowId: string,
    version: RunVersion | undefined,
    runId: string,
  ): Promise<RunDefinitions> {
    return await worded(this.#name, () =>
      this.#versions.definitionsOf(hubId, workflowId, version, runId),
    );
  }

  /** @throws when the version changes local only, can't be read, or fails its trust check */
  async trustedVersionOf(run: {
    readonly runId: string;
    readonly version: RunVersion;
  }): Promise<TrustedVersion> {
    return await worded(this.#name, () => this.#versions.trustedVersionOf(run));
  }

  /** @throws when the run names no version, it can't be read or may not run here, or it has no such agent file */
  async agentFileOf(
    run: { readonly runId: string; readonly version: RunVersion | null },
    hubId: string,
    agentId: string,
  ): Promise<Uint8Array> {
    return await worded(this.#name, () => this.#versions.agentFileOf(run, hubId, agentId));
  }

  /** @throws when the run names no version, it can't be read or may not run here, or it has no such skill */
  async skillTextOf(
    run: { readonly runId: string; readonly version: RunVersion | null },
    hubId: string,
    skillId: string,
  ): Promise<string> {
    return await worded(this.#name, () => this.#versions.skillTextOf(run, hubId, skillId));
  }

  /** Forgets the load kept for a run that has ended. */
  forget(runId: string): void {
    this.#versions.forget(runId);
  }

  /** Closes the history. */
  async close(): Promise<void> {
    await this.#versions.close();
  }
}

/** What `read` gives, or its refusal in the CLI's words. */
async function worded<T>(workspaceName: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    throw inCliWords(error, workspaceName);
  }
}
