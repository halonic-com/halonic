// The served workspace's routines on a clock (`server.routines`, HAL-18499):
// the scheduler `routines watch` builds, with the pause and health the
// desktop engine has (`EngineSchedule`), so both run the same code.
import { EngineSchedule, routineTickReadings } from "@halonicjs/app/routines";
import type { RoutineEngine, RoutineTicks } from "@halonicjs/engine";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { computerTimeZone } from "../routines/list.ts";
import { routineScheduler } from "../routines/watch.ts";
import type { WatchedVersions } from "../routines/watch-versions.ts";
import type { RunSetup } from "../run/run.ts";

/** The served routines: the engine's `routines` option, and the schedule the server's routes pause. */
export interface ServedRoutines {
  readonly schedule: EngineSchedule;
  ticks(engine: RoutineEngine): RoutineTicks;
}

/**
 * The routines `serve` runs: every routine of the live version at each tick,
 * as Studio's engine reads them. They run from the start; the owner pauses
 * them through `PUT /api/routines/pause`.
 */
export function servedRoutines(
  setup: RunSetup,
  workspace: LoadedWorkspace,
  versions: WatchedVersions,
  folderName: string,
): ServedRoutines {
  const schedule = new EngineSchedule();
  schedule.pause(false);
  const timeZone = setup.clock().timeZone ?? computerTimeZone();
  return {
    schedule,
    ticks: (engine) =>
      schedule.ticks(
        routineScheduler(engine, workspace, versions, folderName, setup, async (read) => read),
        routineTickReadings(engine.runs, () => versions.routines.list(), timeZone),
      ),
  };
}
