// Which routines of `halonic routines` have saved changes that aren't live
// yet (HAL-15204). `routines watch` and the Studio start a routine from the
// live version, the last commit, so a saved change to its trigger or what it
// starts does nothing until it is committed. The Studio says so on the
// routine's page with "Changes not live yet"; the list says it too, with
// core's `liveState`, as the Studio's host reads it. The rows themselves
// follow the live version, as the watch runs them (HAL-15479), so the history
// is opened once for both. Listing needs no git, so a git that can't start
// doesn't stop the list: it lists the saved files and says why it couldn't check.

import { type LiveStateInput, liveState, liveVersionOf } from "@halonicjs/app";
import type { ListedRoutine } from "@halonicjs/app/routines";
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

/** The routines as the list shows them, and which of them aren't live yet. */
export interface LiveListing {
  readonly routines: ListedRoutine[];
  readonly notLive: NotLiveRoutines;
}

/**
 * Lists the routines with `list`, given the live version so each is listed
 * as the watch runs it, and finds which aren't live yet. With history off,
 * or when git can't start, `list` gets no live version and lists the saved
 * files.
 */
export async function listAsLive(
  dir: OpenWorkspaceDir,
  workspace: LoadedWorkspace,
  list: (live?: LiveStateInput) => Promise<ListedRoutine[]>,
  openHistory: OpenWorkspaceHistory = openGitHistory,
): Promise<LiveListing> {
  let history: OpenedHistory | null;
  try {
    history = await openHistory(dir.root);
  } catch (error) {
    const notChecked = historyRefusalOf(routinesMessages.liveNotChecked(), error);
    return { routines: await list(), notLive: { checked: false, ...notChecked } };
  }
  if (history === null) {
    return { routines: await list(), notLive: { checked: true, keys: new Set() } };
  }
  try {
    const input = { live: await liveVersionOf(history.vcs), vcs: history.vcs, saved: dir.store };
    const routines = await list(input);
    return { routines, notLive: { checked: true, keys: await notLiveKeys(input, workspace) } };
  } finally {
    await history.close();
  }
}

/**
 * The keys of the routines whose saved file differs from the live
 * version's. None for a routine that was never live: the list doesn't say
 * "not live yet" about a routine no version has.
 */
async function notLiveKeys(
  input: LiveStateInput,
  workspace: LoadedWorkspace,
): Promise<ReadonlySet<string>> {
  const keys = new Set<string>();
  for (const file of filesOf(workspace, "routine")) {
    const state = await liveState(input, file.path);
    if (state.state === "not-live") {
      keys.add(routineKey({ hub: file.hub, routine: file.value }));
    }
  }
  return keys;
}
