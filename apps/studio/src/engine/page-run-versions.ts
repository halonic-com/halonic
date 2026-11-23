// The versions the page's engine starts its runs from (HAL-14229), the window's side of the CLI's
// `WatchedVersions`: Run, the Inbox form and Run now read the live version, as
// `app.runs-read-latest-version` says, or the saved files with history off. A run's definitions,
// its connectors' files and its agents' and skills' files all come from the version it records,
// loaded once per commit, and its trust is checked on that load.
//
// What it keeps is bounded: the latest commit read, plus the commits of runs still going, each
// dropped by `forget` once no run uses it.

import type { WorkflowRef } from "@halonicjs/adapter-workspace-models";
import { liveVersionOf, runSourceFor, runVersionOf } from "@halonicjs/app";
import { withSavedLocalOnly } from "@halonicjs/app/saved-local-only";
import type { RunDefinitions } from "@halonicjs/engine";
import type { RunVersion } from "@halonicjs/events";
import type { DefinitionSource } from "@halonicjs/ports";
import {
  filesOf,
  type LoadedWorkspace,
  loadWorkspace,
  runDefinitionsOf,
  VersionSource,
} from "@halonicjs/workspace";
import { historyOutsideRefusal, historyRefusalOf, nothingLiveRefusal } from "./page-refusal.ts";
import { HistoryOutsideError, type LiveVersions } from "./page-versions.ts";

/**
 * A version's workspace, with its agents' and skills' files as the load read them. The saved
 * files can change under a run, so the texts are taken with the load, never read again later.
 */
export interface LoadedVersion {
  readonly workspace: LoadedWorkspace;
  /** The text of each agent and skill file, by its workspace-relative path. */
  readonly fileTexts: ReadonlyMap<string, string>;
}

/** The version a start reads: what the run records, and that version loaded. */
export interface PickedVersion {
  readonly version: RunVersion;
  readonly loaded: LoadedVersion;
}

/** What a run's connectors and agents read of {@link PageRunVersions}. */
export type RunVersionLoads = Pick<PageRunVersions, "loadedOf" | "forget">;

/** What {@link PageRunVersions} reads. */
export interface PageRunVersionsParts {
  /** The workspace's live version; left out, the workspace has history off. */
  readonly versions?: LiveVersions | undefined;
  /** The saved files. */
  readonly saved: DefinitionSource;
  /** Whether a run's load is kept until {@link PageRunVersions.forget}: only when something calls it. */
  readonly keepsRuns: boolean;
}

/** Stands in for the history when there is none; `runSourceFor` doesn't read it then. */
const noHistory: Pick<LiveVersions, "readAt" | "listAt"> = {
  readAt: () => Promise.reject(new Error("This workspace has no history.")),
  listAt: () => Promise.reject(new Error("This workspace has no history.")),
};

/**
 * The versions one engine starts its runs from.
 *
 * @example
 * const runVersions = new PageRunVersions({ versions, saved: store, keepsRuns: true });
 * const { version, loaded } = await runVersions.pick();
 * await executor.start({ ...run, version });
 */
export class PageRunVersions {
  readonly #parts: PageRunVersionsParts;
  /** The loads at each commit still in use, by commit. */
  readonly #atCommit = new Map<string, Promise<LoadedVersion>>();
  #latestCommit: string | null = null;
  /** The load each running run read, and its commit (`null` for the saved files). */
  readonly #ofRun = new Map<string, { readonly commit: string | null; loaded: LoadedVersion }>();

  constructor(parts: PageRunVersionsParts) {
    this.#parts = parts;
  }

  /**
   * The version the engine opens on: the live version, or the saved files with history off or
   * while nothing is live, so answers and cancels still work then. Its Local only counts as on
   * when the saved files say on too (`withSavedLocalOnly`); a run's definitions still come from
   * the version it records.
   *
   * @throws KindedError `unavailable` when the workspace has history and git can't read it, or
   *   `invalid_input` when the saved `workspace.yaml` can't be read or has an error
   */
  async opening(): Promise<LoadedVersion> {
    const { saved } = this.#parts;
    const live = await this.#liveVersion();
    if (live.kind !== "commit") return await loadVersion(saved);
    const loaded = await this.#loadCommit(live.commit.hash);
    return { ...loaded, workspace: await withSavedLocalOnly(loaded.workspace, saved) };
  }

  /**
   * The version a start from the window reads now (Run, the Inbox form, Run now): the live
   * version, or the saved files with history off.
   *
   * @param run the workflow it starts, whose command a folder that keeps its git files outside it
   *   gives as the step (`historyOutsideRefusal`); left out for an agent, which `halonic run`
   *   doesn't start
   * @throws KindedError `conflict` when the workspace has history but nothing is live yet
   * @throws KindedError `unavailable` when the workspace has history and git can't read it, a
   *   `StartRefused` with the command when the folder keeps its git files outside it
   */
  async pick(run?: WorkflowRef): Promise<PickedVersion> {
    const { versions, saved } = this.#parts;
    const live = await this.#liveVersionFor(run);
    const picked = runSourceFor("run", { live, vcs: versions ?? noHistory, saved });
    if (picked.reads === "nothing-live") throw nothingLiveRefusal();
    const version = runVersionOf(picked);
    return { version, loaded: await this.#load(version) };
  }

  /** The workspace a run of `version` reads: the saved files as they are now for none. */
  async workspaceAt(version: RunVersion | undefined): Promise<LoadedWorkspace> {
    return (await this.#load(version)).workspace;
  }

  /**
   * The definitions a run starts with, from the version it records, after `check` passed on that
   * load; the load is kept for the run's connectors and agents until {@link forget}.
   *
   * @throws what `check` throws, or when the version can't be read or has no such workflow
   */
  async definitionsOf(
    run: { readonly hubId: string; readonly workflowId: string; readonly runId: string },
    version: RunVersion | undefined,
    check: (workspace: LoadedWorkspace) => Promise<void>,
  ): Promise<RunDefinitions> {
    const loaded = await this.#load(version);
    await check(loaded.workspace);
    const definitions = runDefinitionsOf(loaded.workspace, run.hubId, run.workflowId);
    if (this.#parts.keepsRuns) {
      const commit = version?.reads === "live-version" ? version.commit : null;
      this.#ofRun.set(run.runId, { commit, loaded });
    }
    return definitions;
  }

  /**
   * The load a run read, for its connectors and its agents' files: the one kept for it, else its
   * recorded version loaded now, as for a run an earlier engine or the CLI started.
   *
   * @throws when its version can't be read
   */
  async loadedOf(run: {
    readonly runId: string;
    readonly version: RunVersion | null;
  }): Promise<LoadedVersion> {
    return this.#ofRun.get(run.runId)?.loaded ?? (await this.#load(run.version ?? undefined));
  }

  /** Forgets the load kept for a run that has ended, and its commit once no run uses it. */
  forget(runId: string): void {
    this.#ofRun.delete(runId);
    this.#prune();
  }

  /** The commits whose loads are kept: the latest read, and those of runs still going. */
  keptCommits(): string[] {
    return [...this.#atCommit.keys()].sort();
  }

  async #liveVersion() {
    try {
      return await liveVersionOf(this.#parts.versions ?? null);
    } catch (error) {
      throw historyRefusalOf(error);
    }
  }

  /** The live version, with the step to run `run` in a terminal when the folder keeps its git files outside it. */
  async #liveVersionFor(run: WorkflowRef | undefined) {
    try {
      return await this.#liveVersion();
    } catch (error) {
      if (run === undefined || !(error instanceof HistoryOutsideError)) throw error;
      throw historyOutsideRefusal(error, (await loadVersion(this.#parts.saved)).workspace, run);
    }
  }

  /** The load of `version`: the saved files as they are now, or the commit, loaded once while in use. */
  async #load(version: RunVersion | undefined): Promise<LoadedVersion> {
    if (version === undefined || version.reads === "saved-files") {
      return await loadVersion(this.#parts.saved);
    }
    return await this.#loadCommit(version.commit);
  }

  /** The load at `commit`, loaded once while it is the latest or a running run's. */
  async #loadCommit(commit: string): Promise<LoadedVersion> {
    const { versions, saved } = this.#parts;
    if (versions === undefined) {
      throw new Error(`This workspace has no history, so its version ${commit} can't be read.`);
    }
    let loading = this.#atCommit.get(commit);
    if (loading === undefined) {
      loading = loadVersion(new VersionSource(versions, commit, saved.location));
      this.#atCommit.set(commit, loading);
      const started = loading;
      // A load that failed is not kept, so the next start tries again.
      started.catch(() => {
        if (this.#atCommit.get(commit) === started) this.#atCommit.delete(commit);
      });
    }
    this.#latestCommit = commit;
    this.#prune();
    return await loading;
  }

  /** Drops the loads of commits that are neither the latest nor a running run's. */
  #prune(): void {
    const inUse = new Set([...this.#ofRun.values()].map((run) => run.commit));
    for (const commit of this.#atCommit.keys()) {
      if (commit !== this.#latestCommit && !inUse.has(commit)) this.#atCommit.delete(commit);
    }
  }
}

/** Loads `source`, with the texts of its agents' and skills' files. */
async function loadVersion(source: DefinitionSource): Promise<LoadedVersion> {
  const workspace = await loadWorkspace(source);
  const fileTexts = new Map<string, string>();
  for (const file of [...filesOf(workspace, "agent"), ...filesOf(workspace, "skill")]) {
    const text = await source.read(file.path);
    if (text !== null) fileTexts.set(file.path, text);
  }
  return { workspace, fileTexts };
}
