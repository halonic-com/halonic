// Both versions of one routine for its page (engine answer point 4,
// HAL-3267; flow-routines rev 20, 3.4–3.7): the fields show what was saved,
// while Next, the summary and "Your new schedule … isn't live yet" follow
// the live version, which is what runs.

import { type FileProblem, parseFile, type Routine } from "@halonicjs/format";
import { placeOf } from "@halonicjs/workspace";
import { type LiveState, type LiveStateInput, liveState } from "./live-state.ts";

/** One routine as it is live and as it is saved. */
export interface RoutineVersions {
  /**
   * The routine the scheduler runs: as the live version has it, or as
   * saved with history off; `null` when it has never been live.
   */
  readonly live: Routine | null;
  /** The saved routine; `null` when its saved file isn't there or doesn't parse. */
  readonly saved: Routine | null;
  /** Why the saved file doesn't parse; empty when it does or isn't there. */
  readonly savedProblems: readonly FileProblem[];
  /** Whether the saved routine is the live one (`app.live-state`). */
  readonly liveState: LiveState;
}

/**
 * The routine at `path`, live and saved (requirement
 * `app.routine-versions`), read from one live version so its parts agree.
 * By path rather than id, since a routine keeps its file on rename (flow-
 * routines 2.4). `liveState` is the one comparison of the two, so the page
 * and the scheduler never tell them apart differently.
 *
 * @throws RangeError for a path the `DefinitionSource` port refuses
 *
 * @example
 * const live = await liveVersionOf(vcs);
 * const morning = await routineVersions({ live, vcs, saved: store }, "workflows/routines/morning.routine.yaml");
 * if (morning.liveState.state === "not-live") show("Your new schedule … isn't live yet.");
 */
export async function routineVersions(
  input: LiveStateInput,
  path: string,
): Promise<RoutineVersions> {
  // First, so the port refuses an unsafe or private path before anything else is read.
  const state = await liveState(input, path);
  const saved = parseRoutine(path, await input.saved.read(path));
  return {
    live: await liveRoutine(input, path, saved.routine),
    saved: saved.routine,
    savedProblems: saved.problems,
    liveState: state,
  };
}

/** The routine at `path` in the live version; with history off, the saved one, since that is what runs. */
async function liveRoutine(
  input: LiveStateInput,
  path: string,
  saved: Routine | null,
): Promise<Routine | null> {
  const { live, vcs } = input;
  if (live.kind === "history-off") {
    return saved;
  }
  if (live.kind === "none-yet") {
    return null;
  }
  return parseRoutine(path, await vcs.readAt(live.commit.hash, path)).routine;
}

/** A routine file's text parsed: the routine, or why it doesn't parse; neither for no text. */
function parseRoutine(
  path: string,
  text: string | null,
): { readonly routine: Routine | null; readonly problems: readonly FileProblem[] } {
  if (text === null) {
    return { routine: null, problems: [] };
  }
  const placeId = placeOf(path)?.placeId;
  const parsed = parseFile("routine", text, placeId === undefined ? {} : { id: placeId });
  return parsed.ok
    ? { routine: parsed.value.value, problems: [] }
    : { routine: null, problems: parsed.error };
}
