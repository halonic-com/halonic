// Which routines of `halonic routines` have saved changes that aren't live
// yet (HAL-15204). `routines watch` and the Studio start a routine from the
// live version, the last commit, so a saved change to its trigger or what it
// starts does nothing until it is committed. The Studio says so on the
// routine's page with "Changes not live yet"; the list says it too, with
// core's `liveState`, as the Studio's host reads it. Listing needs no git, so
// a git that can't start doesn't stop the list: it says why it couldn't check.

import { liveState, liveVersionOf } from "@halonicjs/app";
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
 * What the list knows about live versions: the keys of the routines whose
 * saved changes aren't live, or why the history couldn't be opened, with
 * its fix, as `halonic run` would refuse.
 */
export type NotLiveRoutines =
  | { readonly checked: true; readonly keys: ReadonlySet<string> }
  | { readonly checked: false; readonly reason: Message; readonly fix: Message };

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
    return { checked: true, keys: new Set() };
  }
  try {
    const live = await liveVersionOf(history.vcs);
    const input = { live, vcs: history.vcs, saved: dir.store };
    const keys = new Set<string>();
    for (const file of filesOf(workspace, "routine")) {
      const state = await liveState(input, file.path);
      if (state.state === "not-live") {
        keys.add(routineKey({ hub: file.hub, routine: file.value }));
      }
    }
    return { checked: true, keys };
  } finally {
    await history.close();
  }
}
