// The routines the scheduler starts (save model, engine answer point 4,
// HAL-3267, on HAL-3246): each routine as its live version has it, since a
// saved change only counts once it is made live, but On and Off, and
// whether the routine is there at all, from its saved file, since stopping
// a routine must never wait for a version.

import { parseFile } from "@halonicjs/format";
import type { DefinitionSource, Vcs } from "@halonicjs/ports";
import type { PlacedRoutine } from "@halonicjs/routines";
import { filesOf, loadWorkspace, placeOf, VersionSource } from "@halonicjs/workspace";
import { liveVersionOf } from "./live-version.ts";
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
 * @example
 * const live = new LiveRoutines({ vcs, saved: store });
 * workspaceRoutineScheduler({ ...options, routines: () => live.list() });
 */
export class LiveRoutines {
  readonly #options: LiveRoutinesOptions;
  /** The last `enabled` read from each saved routine file, by path. */
  readonly #lastEnabled = new Map<string, boolean>();
  /** The live version's routines, kept until the live version moves. */
  #cached: { readonly commit: string; readonly routines: readonly LiveRoutineFile[] } | null = null;

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
    const routines = await this.#liveRoutineFiles(vcs, live.commit.hash);
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

  /** The routines of the live version at `commit`, read once per commit. */
  async #liveRoutineFiles(
    vcs: Pick<Vcs, "readAt" | "listAt">,
    commit: string,
  ): Promise<readonly LiveRoutineFile[]> {
    if (this.#cached?.commit !== commit) {
      const workspace = await loadWorkspace(
        new VersionSource(vcs, commit, this.#options.saved.location),
      );
      const routines = filesOf(workspace, "routine").map((file) => ({
        path: file.path,
        placed: { hub: file.hub, routine: file.value },
      }));
      this.#cached = { commit, routines };
    }
    return this.#cached.routines;
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
