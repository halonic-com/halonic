// Which routines of `halonic routines` have saved changes that aren't live
// yet (HAL-15204), and how they run until then. `routines watch` and the
// Studio start a routine from the live version, the last commit, so a saved
// change to its trigger or what it starts does nothing until it is
// committed. The Studio says so on the routine's page with "Changes not live
// yet", and its rows and Next follow the live version (HAL-15337); the list
// does both too (HAL-15485), with core's `routineVersions`, as the Studio's
// host reads it. Listing needs no git, so a git that can't start doesn't
// stop the list: it says why it couldn't check.

import { liveVersionOf } from "@halonicjs/app";
import { routineVersions } from "@halonicjs/app/routines";
import type { Routine } from "@halonicjs/format";
import { routineKey } from "@halonicjs/routines";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import type { Message } from "../../messages/define.ts";
import { routinesMessages } from "../../messages/routines.ts";
import {
  historyRefusalOf,
  type OpenedHistory,
  type OpenWorkspaceHistory,
  openGitHistory,
} from "../../run-workspace.ts";
import type { OpenWorkspaceDir } from "../../workspace-dir.ts";

/**
 * What the list knows about live versions: the routines whose saved changes
 * aren't live, by their key, or why the history couldn't be opened, with
 * its fix, as `halonic run` would refuse.
 */
export type NotLiveRoutines =
  | { readonly checked: true; readonly routines: ReadonlyMap<string, NotLiveRoutine> }
  | { readonly checked: false; readonly reason: Message; readonly fix: Message };

/** A routine whose saved changes aren't live yet, as the scheduler runs it until they are. */
export interface NotLiveRoutine {
  /** The path of its file. */
  readonly path: string;
  /**
   * The routine as the live version has it, with its saved On or Off, which
   * counts at once, and its saved name, the one the list's line gives it.
   */
  readonly running: Routine;
}

/**
 * The routines whose saved file differs from the live version's. None with
 * history off, where the saved files are what runs, and none for a routine
 * that was never live: the list doesn't say "not live yet" about a routine
 * no version has.
 */
export async function notLiveRoutines(
  dir: OpenWorkspaceDir,
  workspace: LoadedWorkspace,
  openHistory: OpenWorkspaceHistory = openGitHistory,
): Promise<NotLiveRoutines> {
  let history: OpenedHistory | null;
  try {
    history = await openHistory(dir.root);
  } catch (error) {
    return { checked: false, ...historyRefusalOf(routinesMessages.liveNotChecked(), error) };
  }
  if (history === null) {
    return { checked: true, routines: new Map() };
  }
  try {
    const live = await liveVersionOf(history.vcs);
    const input = { live, vcs: history.vcs, saved: dir.store };
    const routines = new Map<string, NotLiveRoutine>();
    for (const file of filesOf(workspace, "routine")) {
      const versions = await routineVersions(input, file.path);
      // A live file that no longer parses can't tell how it runs: the row keeps the saved file.
      if (versions.liveState.state === "not-live" && versions.live !== null) {
        routines.set(routineKey({ hub: file.hub, routine: file.value }), {
          path: file.path,
          running: { ...versions.live, name: file.value.name, enabled: file.value.enabled },
        });
      }
    }
    return { checked: true, routines };
  } finally {
    await history.close();
  }
}

/**
 * The workspace as `routines watch` and the Studio run it: each routine
 * whose saved changes aren't live as the live version has it, so its
 * trigger and Next are the ones that come (HAL-15485). Every other file is
 * as saved, and so are the errors.
 */
export function runningWorkspace(
  workspace: LoadedWorkspace,
  notLive: NotLiveRoutines,
): LoadedWorkspace {
  if (!notLive.checked || notLive.routines.size === 0) {
    return workspace;
  }
  const runningAt = new Map(
    [...notLive.routines.values()].map((each) => [each.path, each.running]),
  );
  return {
    ...workspace,
    files: workspace.files.map((file) => {
      const running = runningAt.get(file.path);
      return running === undefined || file.kind !== "routine" ? file : { ...file, value: running };
    }),
  };
}
