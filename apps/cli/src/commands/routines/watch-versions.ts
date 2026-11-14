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
import type { DefinitionSource, TrustGrant } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import {
  filesOf,
  type LoadedWorkspace,
  loadWorkspace,
  runDefinitionsOf,
  VersionSource,
} from "@halonicjs/workspace";
import { approvedIntegrations } from "../../approved-integrations.ts";
import { OwnLineError } from "../../command.ts";
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
import type { WorkspaceVersions } from "../../workspace-versions.ts";

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
  #latest: LoadedVersion;
  /** The last version loaded at a commit, so the routines due at one time load it once. */
  #atCommit: (LoadedVersion & { readonly commit: string }) | undefined;
  /**
   * The version each running run's definitions were read from, so its
   * connectors start from that same load, and its agents' files are read
   * from that same source, however long after its start they open.
   * Forgotten when the run ends.
   */
  readonly #versionOfRun = new Map<string, LoadedVersion>();
  #checks: VersionChecks = noChecks;

  private constructor(
    dir: OpenWorkspaceDir,
    history: OpenedHistory | null,
    first: LoadedVersion,
    firstCommit: string | undefined,
  ) {
    this.#dir = dir;
    this.#history = history;
    this.#latest = first;
    this.#localOnly = isLocalOnly(first.workspace);
    // The first version is loaded once: the routines and the first run read it from here.
    const loaded = firstCommit === undefined ? undefined : { commit: firstCommit, ...first };
    this.#atCommit = loaded;
    this.routines = new LiveRoutines({
      vcs: history?.vcs ?? null,
      saved: dir.store,
      ...(loaded === undefined
        ? {}
        : { loaded: { commit: loaded.commit, workspace: loaded.workspace } }),
    });
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
        return new WatchedVersions(dir, null, await loadVersion(dir.store), undefined);
      }
      const { vcs } = history;
      const live = await liveVersionOf(vcs);
      const picked = runSourceFor("routine", {
        live,
        vcs,
        saved: dir.store,
      });
      if (picked.reads === "nothing-live") {
        throw new OwnLineError("conflict", runMessages.nothingLive(), runMessages.nothingLiveFix());
      }
      const first = await loadVersion(picked.source);
      return new WatchedVersions(
        dir,
        history,
        first,
        live.kind === "commit" ? live.commit.hash : undefined,
      );
    } catch (error) {
      await history?.close();
      throw error;
    }
  }

  /** The version read last: the first one, until a run starts from a newer one. */
  latest(): LoadedWorkspace {
    return this.#latest.workspace;
  }

  /** Sets the checks each later run's version passes first; until then, none, and no grant. */
  checkWith(checks: VersionChecks): void {
    this.#checks = checks;
  }

  /**
   * The definitions a routine run starts with: from the live version at
   * its commit, or from the saved files as they are now. The version is
   * checked first, becomes {@link latest} once it passes, and is kept for
   * the run's connectors until {@link forget}. A run whose start then fails
   * is forgotten by the engine, as it has no end to do it.
   *
   * @throws when the version changes local only, fails its check, or has no such workflow
   */
  async definitionsOf(
    hubId: string,
    workflowId: string,
    version: RunVersion | undefined,
    runId: string,
  ): Promise<RunDefinitions> {
    const loaded = await this.#versionAllowedAt(version);
    const { workspace } = loaded;
    const grant = await this.#checks.trust(workspace);
    await this.#checks.sandbox(workspace, { hubId, workflowId });
    const definitions = runDefinitionsOf(
      workspace,
      hubId,
      workflowId,
      await approvedIntegrations(grant, this.#dir.root, this.#dir.shown),
    );
    this.#latest = loaded;
    this.#versionOfRun.set(runId, loaded);
    return definitions;
  }

  /**
   * The version a run read, as its connectors start from it: the load its
   * definitions came from, checked for trust again, as a run that started
   * in an earlier watch was checked there, with the grant of that check. A
   * run this watch didn't start has no load kept: its version is loaded now,
   * which for the saved files is how they are now. It doesn't change
   * {@link latest}.
   *
   * @throws when the version changes local only, can't be read, or fails its trust check
   */
  async trustedVersionOf(run: {
    readonly runId: string;
    readonly version: RunVersion;
  }): Promise<TrustedVersion> {
    const { workspace } =
      this.#versionOfRun.get(run.runId) ?? (await this.#versionAllowedAt(run.version));
    return { workspace, trust: await this.#checks.trust(workspace) };
  }

  /**
   * A harness agent's file as the version a run read has it: the load kept
   * for a run this watch started, else the run's recorded version, loaded
   * as {@link trustedVersionOf} loads it. A child run starts from the
   * version its parent read, so it finds the same one.
   *
   * @throws when the run names no version, it can't be read or may not run here, or it has no such agent file
   */
  async agentFileOf(
    run: { readonly runId: string; readonly version: RunVersion | null },
    hubId: string,
    agentId: string,
  ): Promise<Uint8Array> {
    const kept = this.#versionOfRun.get(run.runId);
    if (kept === undefined && run.version === null) {
      throw new Error(plainText(routinesMessages.noVersionForAgentFile(run.runId).phrase));
    }
    const { workspace, agentTexts } =
      kept ?? (await this.#versionAllowedAt(run.version ?? undefined));
    const file = filesOf(workspace, "agent").find(
      (each) => each.hub === hubId && each.value.id === agentId,
    );
    const text = file === undefined ? undefined : agentTexts.get(file.path);
    if (text === undefined) {
      throw new Error(plainText(routinesMessages.noAgentFileInVersion(hubId, agentId).phrase));
    }
    return encodeUtf8(text);
  }

  /** Forgets the load kept for a run that has ended. */
  forget(runId: string): void {
    this.#versionOfRun.delete(runId);
  }

  /** Closes the history. */
  async close(): Promise<void> {
    await this.#history?.close();
  }

  /** The workspace a run of `version` reads, if it keeps local only. */
  async #versionAllowedAt(version: RunVersion | undefined): Promise<LoadedVersion> {
    const loaded = await this.#versionAt(version);
    if (isLocalOnly(loaded.workspace) !== this.#localOnly) {
      throw new Error(plainText(routinesMessages.localOnlyChanged(this.#dir.name).phrase));
    }
    return loaded;
  }

  /** The workspace a run of `version` reads; the one read last for a start that names none. */
  async #versionAt(version: RunVersion | undefined): Promise<LoadedVersion> {
    if (version === undefined) {
      return this.#latest;
    }
    if (version.reads === "saved-files") {
      return await loadVersion(this.#dir.store);
    }
    const vcs = this.#history?.vcs;
    if (vcs === undefined) {
      throw new Error(plainText(routinesMessages.noHistoryForVersion(version.commit).phrase));
    }
    if (this.#atCommit?.commit !== version.commit) {
      const source = new VersionSource(vcs, version.commit, this.#dir.store.location);
      this.#atCommit = { commit: version.commit, ...(await loadVersion(source)) };
    }
    return this.#atCommit;
  }
}

/**
 * A version's workspace, with its agents' files as the load read them. The
 * saved files can change under a run, so the texts are taken with the load
 * and not read again from the source later.
 */
interface LoadedVersion {
  readonly workspace: LoadedWorkspace;
  /** The text of each agent file, by its workspace-relative path. */
  readonly agentTexts: ReadonlyMap<string, string>;
}

async function loadVersion(source: DefinitionSource): Promise<LoadedVersion> {
  const workspace = await loadWorkspace(source);
  const agentTexts = new Map<string, string>();
  for (const file of filesOf(workspace, "agent")) {
    const text = await source.read(file.path);
    if (text !== null) agentTexts.set(file.path, text);
  }
  return { workspace, agentTexts };
}

/** Whether the workspace is local only; without a workspace.yaml that parsed, the format default: not. */
function isLocalOnly(workspace: LoadedWorkspace): boolean {
  return filesOf(workspace, "workspace")[0]?.value.privacy.localOnly === true;
}
