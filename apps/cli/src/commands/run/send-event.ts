// One `halonic run --event`, sent to the run's wait. It reads like `runs
// send`: an event the step doesn't take, or a run that is gone, gets the
// same words. A run that no longer waits was answered by someone else
// first, such as in Studio, and isn't an error.

import { type RunDetail, RunEventRefused, type RunEvents, shortRunId } from "@halonicjs/app";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { OwnLineError } from "../../command.ts";
import { errorMessages } from "../../messages/general.ts";
import { runsMessages } from "../../messages/runs.ts";
import { stepName } from "../../messages/step-name.ts";
import { nearMatch } from "../../near-match.ts";
import { runViewDefinitions } from "../../run-view.ts";

/** The workspace a run runs in, as its error lines name it. */
export interface RunPlace {
  readonly workspace: LoadedWorkspace;
  /** Its name, as in "there's no run 01jd8q in acme." */
  readonly name: string;
  /** The folder as typed with `--dir`, for the commands a fix suggests. */
  readonly dir: string | undefined;
}

/**
 * Sends one `--event`. An event the step doesn't take, or a run that is
 * gone, reads as `runs send`'s refusal, with the same words.
 *
 * @returns false when the run no longer waited for it: someone answered first
 * @throws OwnLineError when the step doesn't take the event, or there is no
 *   such run any more
 */
export async function sendEvent(
  runEvents: Pick<RunEvents, "sendEvent">,
  place: RunPlace,
  run: RunDetail,
  event: string,
): Promise<boolean> {
  try {
    await runEvents.sendEvent(run.summary.id, event);
    return true;
  } catch (error) {
    if (!(error instanceof RunEventRefused)) throw error;
    const { refusal } = error;
    const runId = shortRunId(run.summary.id);
    switch (refusal.reason) {
      case "not-waiting":
        return false;
      case "no-run":
        throw noRun(event, runId, place);
      case "event-not-taken": {
        const states = runViewDefinitions(place.workspace, run.summary).workflow?.states;
        const step = stepName(refusal.step, states?.[refusal.step]?.description);
        throw eventNotTaken(event, runId, step, refusal.accepts);
      }
    }
  }
}

/** "✕ Couldn't send approve to run 01jd8q: there's no run 01jd8q in acme." */
function noRun(event: string, runId: string, place: RunPlace): OwnLineError {
  return new OwnLineError(
    "not_found",
    errorMessages.couldnt(
      runsMessages.sendAction(event, runId).phrase,
      runsMessages.noRun(runId, place.name).phrase,
    ),
    runsMessages.noRunFix(place.dir),
  );
}

/** "✕ Couldn't send aprove to run 01jd8q: the step review takes approve or reject." */
function eventNotTaken(
  event: string,
  runId: string,
  step: string,
  accepts: readonly string[],
): OwnLineError {
  const near = nearMatch(event, accepts);
  return new OwnLineError(
    "invalid_input",
    errorMessages.couldnt(
      runsMessages.sendAction(event, runId).phrase,
      runsMessages.eventNotTaken(step, accepts).phrase,
    ),
    near === undefined ? runsMessages.seeTheStep(runId) : runsMessages.eventNear(near),
  );
}
