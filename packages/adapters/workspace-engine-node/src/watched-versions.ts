// The versions a watch of a workspace's routines starts their runs from
// (save model 2.2–2.3, HAL-6084), shared by `halonic routines watch`,
// `halonic serve` and the agent host's engine role (HAL-17054): the live
// version at the time each routine is due, as `LiveRoutines` reads it for
// the Studio's scheduler, or the saved files with history off. A version
// made while the watch runs is checked as the first one was, for trust, the
// sandbox and local only, before any run starts from it. A run's connectors
// start from the version it read, with the grant of that version's trust
// check (HAL-7500); the grant is only read here, never made. Local only
// counts as on once the saved workspace.yaml says on, before it's made live
// (`app.saved-local-only`): a watch that started without it refuses the next
// run, and a running run's connectors, as for a new version. Each refusal is
// a `VersionRefusedError`, which the caller words.

import {
  LiveRoutines,
  type LiveVersionReader,
  liveState,
  liveVersionOf,
  runSourceFor,
} from "@halonicjs/app";
import type { RunDefinitions } from "@halonicjs/engine";
import type { RunVersion } from "@halonicjs/events";
import type { DefinitionStore, TrustGrant, Vcs } from "@halonicjs/ports";
import {
  filesOf,
  type LoadedFileOf,
  type LoadedWorkspace,
  runDefinitionsOf,
  VersionSource,
} from "@halonicjs/workspace";
import { agentFileIn, type LoadedVersion, skillTextIn } from "./loaded-version.ts";
import type { TrustedVersion } from "./local-run-connectors.ts";
import {
  approvedIntegrations,
  type IntegrationsFolder,
  integrationsAtCommit,
  savedIntegrations,
} from "./version-integrations.ts";
import { VersionRefusedError } from "./version-refused.ts";
import {
  isLocalOnly,
  loadWatched,
  runVersionOfLive,
  type WatchedVersion,
  withSavedLocalOnlyOf,
} from "./watched-version.ts";
import type { WorkspaceAtVersion } from "./workspace-trust-state.ts";

/** What a watch needs of version control: which version is live, and its files. */
export type WatchedHistory = LiveVersionReader & Pick<Vcs, "readAt" | "listAt">;

/** A workspace's history, open until {@link OpenedHistory.close}. */
export interface OpenedHistory {
  readonly vcs: WatchedHistory;
  close(): Promise<void>;
}

/**
 * Opens the history of the workspace in `root`, such as with git.
 *
 * @returns `null` when the workspace has no history
 * @throws when it has history that can't be opened
 */
export type OpenWorkspaceHistory = (root: string) => Promise<OpenedHistory | null>;

/** The workspace folder a watch reads: where it is, and its saved files. */
export interface WatchedFolder extends IntegrationsFolder {
  /** The workspace's saved files. */
  readonly store: DefinitionStore;
}

/**
 * The checks a version passes before anything starts from it, as the watch
 * checked its first version.
 */
export interface VersionChecks {
  /**
   * Checks that the version may run here, on its definitions and local integrations.
   *
   * @returns the grant its connectors start with, or `null` for a version
   *   that can only reach the test model, which starts no program
   * @throws why nothing may start from it
   */
  trust(version: WorkspaceAtVersion): Promise<TrustGrant | null>;
  /**
   * Refuses an agent in a harness, for a watch that starts no program for
   * one. Left out, none is refused.
   *
   * @throws when `agent` is in a harness
   */
  harnessAgent?(agent: LoadedFileOf<"agent">): void;
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
 * const versions = await WatchedVersions.open(dir, openHistory);
 * try {
 *   const first = versions.latest(); // check trust and the sandbox on it
 *   versions.checkWith(checks);
 *   // the engine: { workspace: first, versions }, its scheduler on versions.routines
 * } finally {
 *   await versions.close();
 * }
 */
export class WatchedVersions {
  /** The routine scheduler's routines, targets and versions, as the Studio's reads them. */
  readonly routines: LiveRoutines;
  readonly #dir: WatchedFolder;
  readonly #history: OpenedHistory | null;
  /** Whether the version the watch started from is local only: the engine keeps that. */
  readonly #localOnly: boolean;
  /** Whether that is only because the saved workspace.yaml says on, not yet live. */
  readonly #localOnlySaved: boolean;
  #latest: WatchedVersion;
  /** The last version loaded at a commit, so the routines due at one time load it once. */
  #atCommit: (WatchedVersion & { readonly commit: string }) | undefined;
  /**
   * The version each running run's definitions were read from, so its
   * connectors start from that same load, and its agents' files are read
   * from that same source, however long after its start they open.
   * Forgotten when the run ends.
   */
  readonly #versionOfRun = new Map<string, WatchedVersion>();
  #checks: VersionChecks = noChecks;

  private constructor(
    dir: WatchedFolder,
    history: OpenedHistory | null,
    first: WatchedVersion,
    atCommit: { readonly commit: string; readonly loaded: WatchedVersion } | undefined,
  ) {
    this.#dir = dir;
    this.#history = history;
    this.#latest = first;
    this.#localOnly = isLocalOnly(first.workspace);
    this.#localOnlySaved = first.localOnlySaved === true;
    // The first version is loaded once: the routines and the first run read it from here.
    const loaded =
      atCommit === undefined ? undefined : { commit: atCommit.commit, ...atCommit.loaded };
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
   * @throws VersionRefusedError `history-unavailable` when the workspace has history but it can't be opened
   * @throws VersionRefusedError `nothing-live` when the workspace has history but nothing is live yet
   */
  static async open(
    dir: WatchedFolder,
    openHistory: OpenWorkspaceHistory,
  ): Promise<WatchedVersions> {
    let history: OpenedHistory | null;
    try {
      history = await openHistory(dir.root);
    } catch (error) {
      throw new VersionRefusedError({ reason: "history-unavailable" }, error);
    }
    try {
      if (history === null) {
        const saved = await loadWatched(dir.store, await savedIntegrations(dir));
        return new WatchedVersions(dir, null, saved, undefined);
      }
      const { vcs } = history;
      const live = await liveVersionOf(vcs);
      const picked = runSourceFor("routine", {
        live,
        vcs,
        saved: dir.store,
      });
      if (picked.reads === "nothing-live") {
        throw new VersionRefusedError({ reason: "nothing-live" });
      }
      const integrations =
        picked.reads === "live-version"
          ? await integrationsAtCommit(vcs, picked.commit, dir.store.location)
          : await savedIntegrations(dir);
      const loaded = await loadWatched(picked.source, integrations);
      if (picked.reads === "saved-files") {
        return new WatchedVersions(dir, history, loaded, undefined);
      }
      const first = await withSavedLocalOnlyOf(loaded, dir.store);
      return new WatchedVersions(dir, history, first, { commit: picked.commit, loaded });
    } catch (error) {
      await history?.close();
      throw error;
    }
  }

  /** The version read last: the first one, until a run starts from a newer one. */
  latest(): LoadedWorkspace {
    return this.#latest.workspace;
  }

  /** {@link latest} with its local integrations, for its trust check. */
  latestVersion(): WorkspaceAtVersion {
    return this.#latest;
  }

  /**
   * The live version as it is now: the version at the newest commit, or the
   * saved files with history off. Unlike {@link latest}, it follows a new
   * commit before any run starts from it. The load at a commit is kept, so
   * a call while nothing moved only looks up the commit. It doesn't change
   * {@link latest}.
   */
  async live(): Promise<LoadedWorkspace> {
    return (await this.#liveVersion()).workspace;
  }

  /** {@link live} with its local integrations, for a trust check of the version runs start from now. */
  async liveVersion(): Promise<WorkspaceAtVersion> {
    return await this.#liveVersion();
  }

  /**
   * The live version as {@link live} reads it, only if a run could start
   * from it: it keeps local only and passes the same trust check a run's
   * version passes. A reader that decides where a key may go reads this, so
   * a commit nobody trusted here changes nothing until someone does.
   *
   * @returns the live version, or `null` for one that may not run here
   * @throws when the live version can't be read
   */
  async trustedLive(): Promise<LoadedWorkspace | null> {
    const version = await this.#liveVersion();
    if (isLocalOnly(version.workspace) !== this.#localOnly) return null;
    try {
      await this.#checks.trust(version);
    } catch {
      // The trust check throws to say why nothing may start; here that is a refusal.
      return null;
    }
    return version.workspace;
  }

  /**
   * The routine files of `saved` whose changes aren't live yet: the live
   * version has the routine, but not as saved, so the watch runs it as last
   * committed (C715 #8). None with history off, where the saved files run.
   */
  async routinesNotLive(saved: LoadedWorkspace): Promise<LoadedFileOf<"routine">[]> {
    const vcs = this.#history?.vcs;
    if (vcs === undefined) return [];
    const input = { live: await liveVersionOf(vcs), vcs, saved: this.#dir.store };
    const notLive: LoadedFileOf<"routine">[] = [];
    for (const file of filesOf(saved, "routine")) {
      if ((await liveState(input, file.path)).state === "not-live") notLive.push(file);
    }
    return notLive;
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
    const grant = await this.#checks.trust(loaded);
    await this.#checks.sandbox(workspace, { hubId, workflowId });
    const definitions = runDefinitionsOf(
      workspace,
      hubId,
      workflowId,
      approvedIntegrations(grant, loaded.integrations),
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
    const loaded = await this.#versionOfRunNow(run.runId, run.version);
    return { workspace: loaded.workspace, trust: await this.#checks.trust(loaded) };
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
    return agentFileIn(await this.#loadedForFiles(run), hubId, agentId, (file) =>
      this.#checks.harnessAgent?.(file),
    );
  }

  /**
   * A skill's `SKILL.md` as the version a run read has it, from the same
   * load as {@link agentFileOf}.
   *
   * @throws when the run names no version, it can't be read or may not run here, or it has no such skill
   */
  async skillTextOf(
    run: { readonly runId: string; readonly version: RunVersion | null },
    hubId: string,
    skillId: string,
  ): Promise<string> {
    return skillTextIn(await this.#loadedForFiles(run), hubId, skillId);
  }

  /** The load a run's files are read from: the one kept for it, else its recorded version, loaded now. */
  async #loadedForFiles(run: {
    readonly runId: string;
    readonly version: RunVersion | null;
  }): Promise<LoadedVersion> {
    const kept = this.#versionOfRun.get(run.runId);
    if (kept === undefined && run.version === null) {
      throw new VersionRefusedError({ reason: "no-version-for-agent-file", runId: run.runId });
    }
    return await this.#versionOfRunNow(run.runId, run.version ?? undefined);
  }

  /**
   * The load kept for a run, else its recorded version, loaded now; either
   * refused once it no longer keeps local only. Local only saved on since
   * the run started counts too, so its connectors stop reaching the cloud.
   */
  async #versionOfRunNow(runId: string, version: RunVersion | undefined): Promise<WatchedVersion> {
    const kept = this.#versionOfRun.get(runId);
    if (kept === undefined) return await this.#versionAllowedAt(version);
    return this.#keepingLocalOnly(await withSavedLocalOnlyOf(kept, this.#dir.store));
  }

  /** Forgets the load kept for a run that has ended. */
  forget(runId: string): void {
    this.#versionOfRun.delete(runId);
  }

  /** Closes the history. */
  async close(): Promise<void> {
    await this.#history?.close();
  }

  /** The live version's load, as {@link live} reads it. */
  async #liveVersion(): Promise<WatchedVersion> {
    const live = await liveVersionOf(this.#history?.vcs ?? null);
    return await this.#versionAt(runVersionOfLive(live));
  }

  /** The workspace a run of `version` reads, if it keeps local only. */
  async #versionAllowedAt(version: RunVersion | undefined): Promise<WatchedVersion> {
    return this.#keepingLocalOnly(await this.#versionAt(version));
  }

  /** `loaded`, if it keeps local only as the watch started with it. */
  #keepingLocalOnly(loaded: WatchedVersion): WatchedVersion {
    if (isLocalOnly(loaded.workspace) !== this.#localOnly) {
      // The saved file turned it on, or it was on only through that file and is off now (C755 #2).
      throw new VersionRefusedError({
        reason: "local-only-changed",
        savedNow: loaded.localOnlySaved === true,
        savedAtStart: this.#localOnlySaved,
      });
    }
    return loaded;
  }

  /**
   * The workspace a run of `version` reads; the one read last for a start
   * that names none. A commit's load is kept as committed, and Local only
   * saved on is counted on every read, so a save during the watch counts
   * from the next run.
   */
  async #versionAt(version: RunVersion | undefined): Promise<WatchedVersion> {
    if (version === undefined) {
      return this.#latest;
    }
    if (version.reads === "saved-files") {
      return await loadWatched(this.#dir.store, await savedIntegrations(this.#dir));
    }
    const vcs = this.#history?.vcs;
    if (vcs === undefined) {
      throw new VersionRefusedError({ reason: "no-history-for-version", commit: version.commit });
    }
    if (this.#atCommit?.commit !== version.commit) {
      const { location } = this.#dir.store;
      const source = new VersionSource(vcs, version.commit, location);
      const integrations = await integrationsAtCommit(vcs, version.commit, location);
      this.#atCommit = { commit: version.commit, ...(await loadWatched(source, integrations)) };
    }
    return await withSavedLocalOnlyOf(this.#atCommit, this.#dir.store);
  }
}
