// `halonic routines` read with the live version (HAL-15204). `routines watch`
// and the Studio start a routine from the live version, the last commit, so
// a saved change to its trigger or what it starts does nothing until it is
// committed, and a routine no commit has doesn't run (HAL-15664). The Studio
// says so on the routine's page with "Changes not live yet"; the list says
// it too, with core's `liveState`, as the Studio's host reads it, and its
// rows follow the live version, as the watch runs them (HAL-15479). Listing
// needs no git, so a git that can't start doesn't stop the list: it lists
// the saved files and says why it couldn't check.

import { liveVersionOf } from "@halonicjs/app";
import type { ListedRoutine, LiveListInput } from "@halonicjs/app/routines";
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
 * Whether the list could read the live version, so each routine's
 * `liveState` says which aren't live yet, or why the history couldn't be
 * opened, with its fix, as `halonic run` would refuse.
 */
export type NotLiveRoutines =
  | { readonly checked: true }
  | { readonly checked: false; readonly reason: Message; readonly fix: Message };

/** The routines as the list shows them, and whether their live states were checked. */
export interface LiveListing {
  readonly routines: ListedRoutine[];
  readonly notLive: NotLiveRoutines;
}

/**
 * Lists the routines with `list`, given the live version so each is listed
 * as the watch runs it, with its live state. With history off, or when git
 * can't start, `list` gets no live version and lists the saved files.
 */
export async function listAsLive(
  dir: OpenWorkspaceDir,
  list: (live?: LiveListInput) => Promise<ListedRoutine[]>,
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
    return { routines: await list(), notLive: { checked: true } };
  }
  try {
    const input = { live: await liveVersionOf(history.vcs), vcs: history.vcs, saved: dir.store };
    return { routines: await list(input), notLive: { checked: true } };
  } finally {
    await history.close();
  }
}
