import { type RoutineVersions, runningRoutine } from "@halonicjs/app/routines";
import type { Routine } from "@halonicjs/format";
import { describeTrigger } from "@halonicjs/routines";
import { KindedError } from "@halonicjs/std";
import type { RoutineLiveValues, RoutineView } from "@halonicjs/studio-feature-routines/api";
import { isUnexplained } from "@halonicjs/studio-shell";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { RoutineVersionsAt } from "../changes/workspace-liveness.ts";
import { type PlacedFile, runTargetName } from "./routine-reads.ts";

/** The fields of a {@link RoutineView} that say whether the saved routine is the live one. */
export type RoutineLiveness = Pick<
  RoutineView,
  "everLive" | "changesNotLive" | "liveSince" | "live"
>;

/**
 * The routine the scheduler runs: the live version's, with On or Off as saved, while the saved file
 * isn't live yet, the saved one otherwise (live, never live, or no history). The summary, the rows
 * and Next follow it, while the page's fields show what was saved (flow-routines 3.11). The CLI's
 * routine list takes it from the same core helper, so the two never disagree.
 */
export function runningOf(file: PlacedFile, versions: RoutineVersions | undefined): Routine {
  return runningRoutine(file.value, versions);
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

/** A routine's versions for a list, from one read of the live version; none where the app can't tell. */
export type ListedVersionsAt = (path: string) => Promise<RoutineVersions | undefined>;

/**
 * Reads the live version once for a whole list, not once per routine (HAL-15370). When the history
 * can't be read, or a routine's live version can't, the list falls back to the saved files, as in
 * a folder that keeps no history, and reports why: only the routine's page fails with the error.
 */
export async function listedVersionsAt(
  liveness: (() => Promise<RoutineVersionsAt>) | undefined,
  reportError: (error: unknown) => void,
): Promise<ListedVersionsAt> {
  const asSaved: ListedVersionsAt = async () => undefined;
  if (liveness === undefined) return asSaved;
  const fallBack = (error: unknown): undefined => {
    reportError(error);
    return undefined;
  };
  try {
    const versionsAt = await liveness();
    return (path) => versionsAt(path).catch(fallBack);
  } catch (error) {
    fallBack(error);
    return asSaved;
  }
}

/** The page's reason when the history can't be read and the failure says nothing of its own. */
export const historyUnreadable =
  "This workspace's history can't be read, so Halonic can't tell which version of this routine runs.";

/**
 * A routine's versions for its page and Next, from a fresh read of the live version; none where the
 * app can't tell. A failure with a reason of its own keeps it; one without, such as git stopping
 * without saying why, rejects with {@link historyUnreadable} and keeps the failure as its cause, so
 * the page names the history instead of the engine (C600 #3, HAL-15607).
 */
export async function pageVersionsOf(
  liveness: (() => Promise<RoutineVersionsAt>) | undefined,
  path: string,
): Promise<RoutineVersions | undefined> {
  if (liveness === undefined) return undefined;
  try {
    const versionsAt = await liveness();
    return await versionsAt(path);
  } catch (error) {
    if (!isUnexplained(error)) throw error;
    throw new KindedError("unavailable", historyUnreadable, { cause: error });
  }
}
