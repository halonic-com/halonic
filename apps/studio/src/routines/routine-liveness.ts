import type { RoutineVersions } from "@halonicjs/app/routines";
import type { Routine } from "@halonicjs/format";
import { describeTrigger } from "@halonicjs/routines";
import type { RoutineLiveValues, RoutineView } from "@halonicjs/studio-feature-routines/api";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { type PlacedFile, runTargetName } from "./routine-reads.ts";

/** The fields of a {@link RoutineView} that say whether the saved routine is the live one. */
export type RoutineLiveness = Pick<
  RoutineView,
  "everLive" | "changesNotLive" | "liveSince" | "live"
>;

/**
 * The routine the scheduler runs: the live version's while the saved file isn't live yet, the
 * saved one otherwise (live, never live, or no history). The summary, the rows and Next follow it,
 * while the page's fields show what was saved (flow-routines 3.11).
 */
export function runningOf(file: PlacedFile, versions: RoutineVersions | undefined): Routine {
  if (versions?.liveState.state === "not-live" && versions.live !== null) return versions.live;
  return file.value;
}

/** The page's live fields for the routine's file: live and unchanged when the app can't tell. */
export function livenessOf(
  workspace: LoadedWorkspace,
  file: PlacedFile,
  versions: RoutineVersions | undefined,
): RoutineLiveness {
  if (versions === undefined) return { everLive: true, changesNotLive: false };
  const { liveState, live } = versions;
  const liveValues: RoutineLiveValues | undefined =
    live === null
      ? undefined
      : {
          triggerSentence: describeTrigger(live.trigger),
          targetName: runTargetName(workspace, live.run, file.hub),
          overlap: live.overlap,
          catchUp: live.catchUp,
        };
  return {
    everLive: liveState.state !== "never-versioned",
    changesNotLive: liveState.state === "not-live",
    liveSince: liveState.state === "not-live" ? liveState.since : undefined,
    live: liveValues,
  };
}
