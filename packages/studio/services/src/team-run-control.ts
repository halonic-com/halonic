import type {
  RunAgainBlock,
  RunAgainCheck,
  RunAgainResult,
  RunControlRefusal,
  StopRunResult,
  TeamRunControl,
} from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * How Studio's Runs app stops a team agent's run and runs it again: the
 * engine's `TeamRunControl` (requirement `ports.team-run-control`). Features
 * reach the port only through this key, never through a provider. Where no
 * engine serves it, nothing provides it and the Runs app offers neither
 * action for team runs. A workflow run keeps the engine's own cancel and
 * **Run again**; their failures use the same words as below.
 */
export const TeamRunControlService: ServiceKey<TeamRunControl> =
  serviceKey<TeamRunControl>("team-run-control");

/** The design's words for Stop and Run again (HAL-18594 revision 3, section 2). */
export const runControlWords = {
  stopFailed: "Couldn't stop the run. It may have ended already.",
  runAgainFailed: (reason: string) => `Couldn't start the run: ${reason}`,
  taskDone: (task: string) => `${task} is done, so there's nothing to run again.`,
  taskMoved: (task: string, holder: string) => `${task} is with ${holder} now.`,
  /** For a task held by a person, or an agent whose name couldn't be read: no name is shown. */
  taskMovedUnnamed: (task: string) => `${task} is with someone else now.`,
} as const;

/** The reason after "Couldn't start the run:", in the Studio's own words, with its full stop. */
const runAgainReasons: Readonly<Record<RunAgainBlock | RunControlRefusal, string>> = {
  "task-done": "the task is done.",
  reassigned: "the task is with someone else now.",
  "no-task": "the run didn't work on a task.",
  "not-found": "the team no longer has this run.",
  "not-allowed": "the team refused it.",
  unreachable: "the team's server isn't answering.",
};

/** What the run pane says after Stop: nothing when it went through, the design's line when not. */
export function stopFailureWords(result: StopRunResult): string | undefined {
  return result.outcome === "refused" ? runControlWords.stopFailed : undefined;
}

/** What the run pane says after Run again: nothing when the agent woke. */
export function runAgainFailureWords(result: RunAgainResult): string | undefined {
  return result.outcome === "refused"
    ? runControlWords.runAgainFailed(runAgainReasons[result.reason])
    : undefined;
}

/**
 * The banner line in place of **Run again** when it isn't offered because of
 * the task, or `undefined` when it is offered or there's nothing to say: a run
 * without a task, or a check that couldn't be made (the list says that).
 */
export function runAgainNotice(check: RunAgainCheck): string | undefined {
  if (check.offered || check.task === undefined) {
    return undefined;
  }
  if (check.why === "task-done") {
    return runControlWords.taskDone(check.task);
  }
  if (check.why === "reassigned") {
    return check.holder === undefined
      ? runControlWords.taskMovedUnnamed(check.task)
      : runControlWords.taskMoved(check.task, check.holder);
  }
  return undefined;
}
