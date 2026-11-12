// The versions `halonic routines watch` starts its routines' runs from
// (save model 2.2–2.3, HAL-6084): the live version at the time each routine
// is due, as `LiveRoutines` reads it for the Studio's scheduler, or the
// saved files with history off. A version made while the watch runs is
// checked as the first one was, for trust, the sandbox and local only,
// before any run starts from it. A run's connectors start from the version
// it read, with the grant of that version's trust check (HAL-7500).

import { LiveRoutines, liveVersionOf, runSourceFor } from "@halonicjs/app";
import type { RunDefinitions } from "@halonicjs/engine";
import type { RunVersion } from "@halonicjs/events";
import type { TrustGrant } from "@halonicjs/ports";
import {
  filesOf,
  type LoadedWorkspace,
  loadWorkspace,
  runDefinitionsOf,
  VersionSource,
} from "@halonicjs/workspace";
import { OwnLineError } from "../../command.ts";
import type { WorkspaceVersions } from "../../local-engine-host.ts";
import type { TrustedVersion } from "../../local-run-connectors.ts";
import { plainText } from "../../messages/phrase.ts";
import { routinesMessages } from "../../messages/routines.ts";
import { runMessages } from "../../messages/run.ts";
import {
  HistoryUnavailableError,
  type OpenedHistory,
  type OpenWorkspaceHistory,
  openGitHistory,
} from "../../run-workspace.ts";
import type { OpenWorkspaceDir } from "../../workspace-dir.ts";

/**
 * The checks a version passes before anything starts from it, as the watch
 * checked its first version.
 */
export interface VersionChecks {
  /**
   * Checks that the version may run here.
   *
   * @returns the grant its connectors start with, or `null` for a version
   *   that can only reach the test model, which starts no program
   * @throws why nothing may start from it
   */
  trust(workspace: LoadedWorkspace): Promise<TrustGrant | null>;
  /**
   * Checks the sandbox for the workflow a run starts.
   *
   * @throws why the run may not start
   */
  sandbox(
    workspace: LoadedWorkspace,
    run: { readonly hubId: string; readonly workflowId: string },
  ): Promise<void>;
}

/** Until the watch sets its own: every version passes, and starts no program. */
const noChecks: VersionChecks = {
  trust: async () => null,
  sandbox: async () => {},
};

/**
 * The versions of one watch, open until {@link WatchedVersions.close}:
 * the routines to schedule, read again on every tick, and the definitions
 * each routine run starts with, from the version it records.
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
  readonly #dir: OpenWorkspaceDir;
  readonly #history: OpenedHistory | null;
  /** Whether the version the watch started from is local only: the engine keeps that. */
  readonly #localOnly: boolean;
  #latest: LoadedWorkspace;
  /** The last version loaded at a commit, so the routines due at one time load it once. */
  #atCommit: { readonly commit: string; readonly workspace: LoadedWorkspace } | undefined;
  #checks: VersionChecks = noChecks;

  private constructor(
    dir: OpenWorkspaceDir,
    history: OpenedHistory | null,
    first: LoadedWorkspace,
  ) {
    this.#dir = dir;
    this.#history = history;
    this.#latest = first;
    this.#localOnly = isLocalOnly(first);
    this.routines = new LiveRoutines({ vcs: history?.vcs ?? null, saved: dir.store });
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
    let history: OpenedHistory | null;
    try {
      history = await openHistory(dir.root);
    } catch (error) {
      throw new HistoryUnavailableError(runMessages.nothingRan(), error);
    }
    try {
      if (history === null) {
        return new WatchedVersions(dir, null, await loadWorkspace(dir.store));
      }
      const { vcs } = history;
      const picked = runSourceFor("routine", {
        live: await liveVersionOf(vcs),
        vcs,
        saved: dir.store,
      });
      if (picked.reads === "nothing-live") {
        throw new OwnLineError("conflict", runMessages.nothingLive(), runMessages.nothingLiveFix());
      }
      return new WatchedVersions(dir, history, await loadWorkspace(picked.source));
    } catch (error) {
      await history?.close();
      throw error;
    }
  }

  /** The version read last: the first one, until a run starts from a newer one. */
  latest(): LoadedWorkspace {
    return this.#latest;
  }

  /** Sets the checks each later run's version passes first; until then, none, and no grant. */
  checkWith(checks: VersionChecks): void {
    this.#checks = checks;
  }

  /**
   * The definitions a routine run starts with: from the live version at
   * its commit, or from the saved files as they are now. The version is
   * checked first, and becomes {@link latest} once it passes.
   *
   * @throws when the version changes local only, fails its check, or has no such workflow
   */
  async definitionsOf(
    hubId: string,
    workflowId: string,
    version: RunVersion | undefined,
  ): Promise<RunDefinitions> {
    const { workspace } = await this.#trustedAt(version);
    await this.#checks.sandbox(workspace, { hubId, workflowId });
    this.#latest = workspace;
    return runDefinitionsOf(workspace, hubId, workflowId);
  }

  /**
   * The version a run read, as its connectors start from it: checked for
   * trust again, as a run that started in an earlier watch was checked
   * there, with the grant of that check. It doesn't change {@link latest}.
   *
   * @throws when the version changes local only, can't be read, or fails its trust check
   */
  async trustedVersionOf(version: RunVersion): Promise<TrustedVersion> {
    return await this.#trustedAt(version);
  }

  /** Closes the history. */
  async close(): Promise<void> {
    await this.#history?.close();
  }

  /** The workspace a run of `version` reads, if it keeps local only and passes its trust check. */
  async #trustedAt(version: RunVersion | undefined): Promise<TrustedVersion> {
    const workspace = await this.#workspaceAt(version);
    if (isLocalOnly(workspace) !== this.#localOnly) {
      throw new Error(plainText(routinesMessages.localOnlyChanged(this.#dir.name).phrase));
    }
    return { workspace, trust: await this.#checks.trust(workspace) };
  }

  /** The workspace a run of `version` reads; the one read last for a start that names none. */
  async #workspaceAt(version: RunVersion | undefined): Promise<LoadedWorkspace> {
    if (version === undefined) {
      return this.#latest;
    }
    if (version.reads === "saved-files") {
      return await loadWorkspace(this.#dir.store);
    }
    const vcs = this.#history?.vcs;
    if (vcs === undefined) {
      throw new Error(plainText(routinesMessages.noHistoryForVersion(version.commit).phrase));
    }
    if (this.#atCommit?.commit !== version.commit) {
      const source = new VersionSource(vcs, version.commit, this.#dir.store.location);
      this.#atCommit = { commit: version.commit, workspace: await loadWorkspace(source) };
    }
    return this.#atCommit.workspace;
  }
}

/** Whether the workspace is local only; without a workspace.yaml that parsed, the format default: not. */
function isLocalOnly(workspace: LoadedWorkspace): boolean {
  return filesOf(workspace, "workspace")[0]?.value.privacy.localOnly === true;
}
