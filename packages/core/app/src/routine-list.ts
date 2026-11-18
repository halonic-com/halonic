// A workspace's routines as a list, for `halonic routines` (HAL-4844): what
// starts each one in words, when it runs next on its own, and the last run it
// started. The words and times come from `@halonicjs/routines`, so the list
// says what the routine scheduler does. A routine file that doesn't load is
// listed too, with its error, so a typing mistake doesn't hide it (HAL-12607).

import type { RunSummary } from "@halonicjs/events";
import type { RunStore } from "@halonicjs/ports";
import {
  CronError,
  describeTrigger,
  nextRun,
  type PlacedRoutine,
  routineKey,
} from "@halonicjs/routines";
import { filesOf, type LoadedWorkspace, placeOf, type WorkspaceIssue } from "@halonicjs/workspace";

/** One routine of the list. */
export interface ListedRoutine {
  /** `<hub>/<routine id>`, or `@workspace/<routine id>` outside a hub: its runs' `trigger.routineId`. */
  key: string;
  /** The hub folder it sits in, or `null` at the workspace root. */
  hubId: string | null;
  routineId: string;
  /** Its name, or for a file that doesn't load its routine id, as the file's name has it. */
  name: string;
  /**
   * Whether it is on (`enabled`); one that is off never runs on its own. A
   * file that doesn't load is off: the routine scheduler never sees it.
   */
  enabled: boolean;
  /**
   * What starts it, in words: "Mondays at 09:00", "Every 15 minutes", "Manual
   * only". For a file that doesn't load, its first error and line instead.
   */
  trigger: string;
  /**
   * The ISO time it next runs on its own. `null` when it is off, when its
   * trigger isn't a clock (manual, signal, mail), or when its schedule
   * doesn't parse, which `trigger` then says.
   */
  nextRun: string | null;
  /** The newest real run it started, or `null` if it never started one. */
  lastRun: RunSummary | null;
}

/** Lists a workspace's routines with their next and last runs, from its {@link RunStore}. */
export class RoutineList {
  readonly #runs: Pick<RunStore, "list">;

  constructor(runs: Pick<RunStore, "list">) {
    this.#runs = runs;
  }

  /**
   * Every routine file of the workspace, in the order of the files' paths
   * (requirement `app.routine-list`). A file that doesn't load is listed
   * with its first error, as {@link unloadedRoutine} writes it.
   *
   * @param now - the next run is the first one after it
   * @param timeZone - the zone of a schedule that names none: the computer's
   *   own, as the routine scheduler's tick policy has it
   *
   * @example
   * await new RoutineList(runStore).listRoutines(workspace, new Date(), "Europe/Amsterdam");
   * // [{ key: "reports/weekly-report", trigger: "Mondays at 09:00", nextRun: "2026-11-16T08:00:00.000Z", lastRun: null, … }]
   */
  async listRoutines(
    workspace: LoadedWorkspace,
    now: Date,
    timeZone: string,
  ): Promise<ListedRoutine[]> {
    const lastRuns = newestPerRoutine(await this.#runs.list({ kind: "run" }));
    const loaded = filesOf(workspace, "routine").map((file) => ({
      path: file.path,
      listed: loadedRoutine({ hub: file.hub, routine: file.value }, now, timeZone),
    }));
    const unloaded = unloadedRoutineFiles(workspace).map((file) => ({
      path: file.path,
      listed: unloadedRoutine(file),
    }));
    // Paths compare by code unit, as the workspace sorts its files; no two are the same.
    return [...loaded, ...unloaded]
      .sort((a, b) => (a.path < b.path ? -1 : 1))
      .map(({ listed }) => ({ ...listed, lastRun: lastRuns.get(listed.key) ?? null }));
  }
}

/** A routine as the list gives it, before its last run is looked up. */
type ListedWithoutRun = Omit<ListedRoutine, "lastRun">;

function loadedRoutine(placed: PlacedRoutine, now: Date, timeZone: string): ListedWithoutRun {
  const { routine } = placed;
  return {
    key: routineKey(placed),
    hubId: placed.hub,
    routineId: routine.id,
    name: routine.name,
    enabled: routine.enabled,
    trigger: describeTrigger(routine.trigger),
    nextRun: routine.enabled ? nextRunOf(routine.trigger, now, timeZone) : null,
  };
}

/** A routine file that didn't load, with where it sits and its first error. */
interface UnloadedRoutineFile {
  path: string;
  hub: string | null;
  /** The routine id its file's name gives. */
  id: string;
  error: WorkspaceIssue;
}

/**
 * The routine files that didn't load, each with its first error. Only a
 * file's own problems keep it from loading; the checks across files run on
 * loaded files alone, so an error on a file no loaded file has is its own.
 */
function unloadedRoutineFiles(workspace: LoadedWorkspace): UnloadedRoutineFile[] {
  const loadedPaths = new Set(workspace.files.map((file) => file.path));
  const unloaded = new Map<string, UnloadedRoutineFile>();
  for (const issue of workspace.issues) {
    if (issue.severity !== "error" || loadedPaths.has(issue.file) || unloaded.has(issue.file)) {
      continue;
    }
    const place = placeOf(issue.file);
    if (place?.kind === "routine" && place.placeId !== undefined) {
      unloaded.set(issue.file, {
        path: issue.file,
        hub: place.hub,
        id: place.placeId,
        error: issue,
      });
    }
  }
  return [...unloaded.values()];
}

/**
 * A routine file that didn't load, listed by its file's routine id: off, as
 * the routine scheduler never sees it, with no next run, and its first error
 * where the trigger goes, such as `Invalid file, line 4: use a number and a
 * unit, e.g. "15m", …`. The other errors, if any, are `halonic check`'s.
 */
function unloadedRoutine(file: UnloadedRoutineFile): ListedWithoutRun {
  return {
    key: routineKey({ hub: file.hub, routine: { id: file.id } }),
    hubId: file.hub,
    routineId: file.id,
    name: file.id,
    enabled: false,
    trigger: `Invalid file, line ${file.error.line}: ${file.error.message}`,
    nextRun: null,
  };
}

/** The newest run of each routine, by its key; `runs` come newest first, as `RunStore.list` gives them. */
function newestPerRoutine(runs: readonly RunSummary[]): Map<string, RunSummary> {
  const newest = new Map<string, RunSummary>();
  for (const run of runs) {
    const key = run.trigger?.routineId;
    if (key !== undefined && !newest.has(key)) {
      newest.set(key, run);
    }
  }
  return newest;
}

/**
 * The next run as ISO text, or `null`. A schedule that doesn't parse has no
 * next run: `describeTrigger` already says it doesn't parse, and the routine
 * scheduler skips it, so the list doesn't fail for one broken routine.
 */
function nextRunOf(
  trigger: Parameters<typeof nextRun>[0],
  now: Date,
  timeZone: string,
): string | null {
  try {
    return nextRun(trigger, now, timeZone)?.toISOString() ?? null;
  } catch (error) {
    if (error instanceof CronError) {
      return null;
    }
    throw error;
  }
}
