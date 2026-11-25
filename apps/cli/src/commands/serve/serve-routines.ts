// The served workspace's routines on a clock (`server.routines`, HAL-18499):
// the scheduler `routines watch` builds, with the pause and health the
// desktop engine has (`EngineSchedule`), so both run the same code. The
// routines that can't start are left out as the watch leaves them out, with
// the same ✕ lines, and the workflows the others start are what the engine's
// sandbox check reads before anything opens.
import { EngineSchedule, routineTickReadings } from "@halonicjs/app/routines";
import type { RoutineEngine, RoutineTicks } from "@halonicjs/engine";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import type { CommandContext } from "../../command.ts";
import type { SandboxGateRun } from "../../sandbox-gate.ts";
import type { OpenWorkspaceDir } from "../../workspace-dir.ts";
import { computerTimeZone } from "../routines/list.ts";
import { routineScheduler, workflowsOf } from "../routines/watch.ts";
import { RoutinesThatCantStart, withoutCantStart } from "../routines/watch-cant-start.ts";
import type { WatchedVersions } from "../routines/watch-versions.ts";
import type { RunSetup } from "../run/run.ts";

/** The served routines: the engine's `routines` option, and the schedule the server's routes pause. */
export interface ServedRoutines {
  readonly schedule: EngineSchedule;
  /**
   * The workflows the routines on the scheduler start, for the sandbox check
   * when the engine opens. Webhook routines aren't among them: the server
   * checks each delivery's run as it starts, as before.
   */
  readonly runs: readonly SandboxGateRun[];
  ticks(engine: RoutineEngine): RoutineTicks;
}

/**
 * The routines `serve` runs: those of the live version at each tick, as
 * Studio's engine reads them, without the ones `routines watch` leaves out.
 * They run from the start; the owner pauses them through
 * `PUT /api/routines/pause`.
 *
 * @param typedDir - the user's own `--dir`, for the ✕ line's `halonic validate`
 */
export async function servedRoutines(
  context: CommandContext,
  setup: RunSetup,
  dir: OpenWorkspaceDir,
  typedDir: string | undefined,
  workspace: LoadedWorkspace,
  versions: WatchedVersions,
): Promise<ServedRoutines> {
  const schedule = new EngineSchedule();
  schedule.pause(false);
  const timeZone = setup.clock().timeZone ?? computerTimeZone();
  const cantStart = new RoutinesThatCantStart(context, typedDir, () => loadWorkspace(dir.store));
  const scheduled = withoutCantStart(workspace, await versions.routines.listLoaded()).filter(
    ({ routine }) => !("webhook" in routine.trigger),
  );
  return {
    schedule,
    runs: workflowsOf(scheduled),
    ticks: (engine) =>
      schedule.ticks(
        routineScheduler(engine, workspace, versions, dir.name, setup, async (read) =>
          cantStart.leaveOut(await versions.live(), read),
        ),
        routineTickReadings(engine.runs, () => versions.routines.list(), timeZone),
      ),
  };
}
