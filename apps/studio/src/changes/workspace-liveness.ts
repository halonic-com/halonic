import { type LiveState, type LiveStateInput, type LiveVersion, liveState } from "@halonicjs/app";
import { type RoutineVersions, routineVersions } from "@halonicjs/app/routines";
import type { DefinitionSource, VcsChange } from "@halonicjs/ports";
import type { ChangesSource, Version } from "@halonicjs/studio-feature-source-control/api";

/** What {@link WorkspaceLiveness} reads. */
export interface WorkspaceLivenessParts {
  /** The workspace's history: what changed since the last version, a changed file in it, and the last version. */
  readonly history: Pick<ChangesSource, "read" | "readTexts" | "readHistory">;
  /** The folder's saved files, which are what a new version would hold. */
  readonly saved: DefinitionSource;
}

/**
 * Whether an item's saved file is what runs (core's `app.live-state`), read from the workspace's
 * history through the shell's `git`. Each call reads the live version afresh, so a new version or
 * a saved change shows on the next read.
 *
 * @example
 * const liveness = new WorkspaceLiveness({ history: changes, saved: store });
 * const state = await liveness.liveState("agents/briefing.agent.yaml");
 */
export class WorkspaceLiveness {
  readonly #parts: WorkspaceLivenessParts;

  constructor(parts: WorkspaceLivenessParts) {
    this.#parts = parts;
  }

  /** The live state of the file at `path`, from the workspace folder. */
  async liveState(path: string): Promise<LiveState> {
    return liveState(await this.#input(), path);
  }

  /** The routine at `path` as the live version has it and as it is saved. */
  async routineVersions(path: string): Promise<RoutineVersions> {
    return routineVersions(await this.#input(), path);
  }

  /**
   * The live version and a way to read its files. Git's allow-list has no `show`, so a file of the
   * live version comes from `git diff HEAD`, as the Changes page reads it; `readAt` therefore only
   * answers for the live version, the one commit `liveState` asks it about.
   */
  async #input(): Promise<LiveStateInput> {
    const { history, saved } = this.#parts;
    const changes = await history.read();
    if (changes.kind !== "ready") return { live: { kind: "history-off" }, vcs: noVersions, saved };
    const [last] = await history.readHistory(1);
    if (last === undefined) return { live: { kind: "none-yet" }, vcs: noVersions, saved };
    return {
      live: liveVersionOf(last),
      vcs: { readAt: (_version, path) => this.#readLive(changes.changes, path) },
      saved,
    };
  }

  /** The file at `path` in the last version, `null` when that version doesn't have it. */
  async #readLive(changes: readonly VcsChange[], path: string): Promise<string | null> {
    const change = changes.find((one) => one.path === path || one.from === path);
    // Unchanged since the last version, so the saved file is the live one.
    if (change === undefined) return this.#parts.saved.read(path);
    // Renamed to `path` since: the last version had the file under its old name only.
    if (change.path === path && change.from !== undefined) return null;
    return (await this.#parts.history.readTexts(change)).before;
  }
}

/** The live version a version of the Changes page's history is. */
function liveVersionOf(version: Version): LiveVersion {
  return {
    kind: "commit",
    commit: {
      hash: version.id,
      author: version.author,
      date: new Date(version.at).toISOString(),
      message: version.name,
    },
  };
}

/** The history of a workspace with no version to read: `liveState` never asks it. */
const noVersions: LiveStateInput["vcs"] = {
  readAt: () => Promise.reject(new Error("This workspace has no version to read.")),
};
