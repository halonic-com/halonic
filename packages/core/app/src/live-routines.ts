// The routines the scheduler starts (save model, engine answer point 4,
// HAL-3267, on HAL-3246): each routine as its live version has it, since a
// saved change only counts once it is made live, but On and Off, and
// whether the routine is there at all, from its saved file, since stopping
// a routine must never wait for a version.

import type { RunVersion } from "@halonicjs/events";
import { parseFile } from "@halonicjs/format";
import type { DefinitionSource, Vcs } from "@halonicjs/ports";
import type { DueRun, PlacedRoutine } from "@halonicjs/routines";
import {
  filesOf,
  type LoadedWorkspace,
  loadWorkspace,
  placeOf,
  VersionSource,
} from "@halonicjs/workspace";
import { liveVersionOf } from "./live-version.ts";
import type { TargetUnavailableWhy } from "./routine-skips.ts";
import { runSourceFor, runVersionOf } from "./run-source.ts";
import { placedRoutines } from "./workspace-routines.ts";

/** What {@link LiveRoutines} reads. */
export interface LiveRoutinesOptions {
  /** The workspace's version control, or `null` for a workspace opened without it. */
  readonly vcs: Pick<Vcs, "status" | "log" | "readAt" | "listAt"> | null;
  /** The saved files. */
  readonly saved: DefinitionSource;
}

/** One live routine, with the path of its file, before its saved `enabled` is applied. */
interface LiveRoutineFile {
  readonly path: string;
  readonly placed: PlacedRoutine;
}

/** What {@link LiveRoutines} keeps of one live version. */
interface KeptVersion {
  readonly commit: string;
  readonly routines: readonly LiveRoutineFile[];
  /** The file of each workflow and agent a routine can start, by {@link targetKey}. */
  readonly targets: ReadonlyMap<string, string>;
}

/**
 * The routine scheduler's list of routines, read again on every tick
 * (requirements `app.scheduler-live-routines`,
 * `app.scheduler-never-live-not-scheduled`,
 * `app.scheduler-keeps-last-enabled-when-unreadable` and
 * `app.scheduler-rebuild-on-version-and-watch`).
 *
 * - Each routine's trigger, target, input and rules come from the live
 *   version. A routine that isn't in it has never been live and isn't
 *   scheduled.
 * - `enabled` comes from the saved file at the same path (a routine keeps
 *   its file on rename). No saved file, such as one in the trash or deleted
 *   in a terminal, means the routine isn't scheduled. A saved file that
 *   can't be read keeps the last `enabled` read from it, so a half-typed
 *   file never turns a routine on or off; before any was read, the live
 *   version's value counts.
 * - With history off, everything comes from the saved files, as before.
 *
 * The live routines are read again only when the live version moves (a new
 * version, Get updates, a commit from outside). The saved files are read on
 * every call, so a watch event needs no signal: Off acts by the next tick.
 * Keep one instance per open workspace, for the `enabled` values it keeps.
 *
 * {@link targetUnavailable} is the scheduler's check that a due routine's
 * target can start.
 *
 * @example
 * const live = new LiveRoutines({ vcs, saved: store });
 * workspaceRoutineScheduler({
 *   ...options,
 *   routines: () => live.list(),
 *   targetUnavailable: (run) => live.targetUnavailable(run),
 *   runVersion: () => live.runVersion(),
 * });
 */
export class LiveRoutines {
  readonly #options: LiveRoutinesOptions;
  /** The last `enabled` read from each saved routine file, by path. */
  readonly #lastEnabled = new Map<string, boolean>();
  /** The live version's routines and targets, kept until the live version moves. */
  #kept: KeptVersion | null = null;

  constructor(options: LiveRoutinesOptions) {
    this.#options = options;
  }

  /** The routines to schedule, in the order of their files' paths: what the scheduler's `routines` returns. */
  async list(): Promise<PlacedRoutine[]> {
    const { vcs, saved } = this.#options;
    const live = await liveVersionOf(vcs);
    if (live.kind === "history-off") {
      return placedRoutines(await loadWorkspace(saved));
    }
    if (live.kind === "none-yet" || vcs === null) {
      return [];
    }
    const { routines } = await this.#liveVersion(vcs, live.commit.hash);
    const scheduled: PlacedRoutine[] = [];
    for (const { path, placed } of routines) {
      const enabled = await this.#savedEnabled(path, placed.routine.enabled);
      if (enabled !== null) {
        scheduled.push({ ...placed, routine: { ...placed.routine, enabled } });
      }
    }
    this.#forgetAllBut(routines.map((routine) => routine.path));
    return scheduled;
  }

  /**
   * Why the due run's target can't start, for the scheduler's
   * `targetUnavailable` (requirement `app.scheduler-skip-target-unavailable`):
   * - `never-live`: the workflow or agent it starts isn't in the live version;
   * - `in-trash`: it is, but its saved file is gone, as when it was moved to
   *   the trash;
   * - `null`: it can start. Also with history off, where every run reads the
   *   saved files, and for a routine whose target has no hub: its start
   *   fails on its own and is reported.
   */
  async targetUnavailable(run: DueRun): Promise<TargetUnavailableWhy | null> {
    const { vcs, saved } = this.#options;
    const live = await liveVersionOf(vcs);
    if (live.kind === "history-off") {
      return null;
    }
    if (live.kind === "none-yet" || vcs === null) {
      return "never-live";
    }
    const target = targetOf(run.placed);
    if (target === null) {
      return null;
    }
    const { targets } = await this.#liveVersion(vcs, live.commit.hash);
    const path = targets.get(target);
    if (path === undefined) {
      return "never-live";
    }
    return (await saved.read(path)) === null ? "in-trash" : null;
  }

  /**
   * The version a routine run started now reads, for the scheduler's
   * `runVersion` (requirement `app.run-records-its-version`): the live
   * version, with its commit and date, or the saved files with history
   * off. `null` while nothing is live, when no routine is scheduled.
   */
  async runVersion(): Promise<RunVersion | null> {
    const { vcs, saved } = this.#options;
    const live = await liveVersionOf(vcs);
    if (live.kind === "history-off" || vcs === null) {
      return { reads: "saved-files" };
    }
    const picked = runSourceFor("routine", { live, vcs, saved });
    return picked.reads === "nothing-live" ? null : runVersionOf(picked);
  }

  /** The routines and targets of the live version at `commit`, read once per commit. */
  async #liveVersion(vcs: Pick<Vcs, "readAt" | "listAt">, commit: string): Promise<KeptVersion> {
    if (this.#kept?.commit !== commit) {
      const workspace = await loadWorkspace(
        new VersionSource(vcs, commit, this.#options.saved.location),
      );
      const routines = filesOf(workspace, "routine").map((file) => ({
        path: file.path,
        placed: { hub: file.hub, routine: file.value },
      }));
      this.#kept = { commit, routines, targets: targetFiles(workspace) };
    }
    return this.#kept;
  }

  /**
   * The saved file's `enabled` for the routine at `path`: `null` when there
   * is no saved file, and the last value read, or `fallback` before any was,
   * when the saved file doesn't parse.
   */
  async #savedEnabled(path: string, fallback: boolean): Promise<boolean | null> {
    const text = await this.#options.saved.read(path);
    if (text === null) {
      this.#lastEnabled.delete(path);
      return null;
    }
    const placeId = placeOf(path)?.placeId;
    const parsed = parseFile("routine", text, placeId === undefined ? {} : { id: placeId });
    if (!parsed.ok) {
      return this.#lastEnabled.get(path) ?? fallback;
    }
    this.#lastEnabled.set(path, parsed.value.value.enabled);
    return parsed.value.value.enabled;
  }

  /** Drops the kept `enabled` of routines no longer live, so the map doesn't grow. */
  #forgetAllBut(paths: readonly string[]): void {
    const kept = new Set(paths);
    for (const path of this.#lastEnabled.keys()) {
      if (!kept.has(path)) {
        this.#lastEnabled.delete(path);
      }
    }
  }
}

/** A workflow or agent a routine can start, as `<kind>:<hub>/<id>`. */
function targetKey(kind: "workflow" | "agent", hub: string, id: string): string {
  return `${kind}:${hub}/${id}`;
}

/** The file of each workflow and agent in a hub, by {@link targetKey}. */
function targetFiles(workspace: LoadedWorkspace): Map<string, string> {
  const files = new Map<string, string>();
  for (const file of filesOf(workspace, "workflow")) {
    if (file.hub !== null) files.set(targetKey("workflow", file.hub, file.value.id), file.path);
  }
  for (const file of filesOf(workspace, "agent")) {
    if (file.hub !== null) files.set(targetKey("agent", file.hub, file.value.id), file.path);
  }
  return files;
}

/**
 * The workflow or agent the routine starts, by {@link targetKey}: in the hub
 * its `run` names, else its own. `null` when neither names one.
 */
function targetOf({ hub, routine }: PlacedRoutine): string | null {
  const targetHub = routine.run.hub ?? hub;
  if (targetHub === null) {
    return null;
  }
  return "workflow" in routine.run
    ? targetKey("workflow", targetHub, routine.run.workflow)
    : targetKey("agent", targetHub, routine.run.agent);
}
