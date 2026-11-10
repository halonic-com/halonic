// What `halonic run` prints once the run has ended or waits for the user
// (cli-output 3.4): the heading, the step lines, then the finished run's
// receipt, the waiting lines or the failed run's two lines and receipt. It is worked out
// from the run log alone, through the same helpers `halonic runs show` uses,
// so both say the same about a run. The words are the catalogue's.

import { type RunDetail, shortRunId } from "@halonicjs/app";
import { type RunEvent, summarize } from "@halonicjs/events";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { CommandResult, StoppedResult } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { type Phrase, phrase } from "../../messages/phrase.ts";
import { runMessages } from "../../messages/run.ts";
import { stepName } from "../../messages/step-name.ts";
import { workspaceModelsOf } from "../../run-failure-of.ts";
import { runSteps } from "../../run-steps.ts";
import type { RunClock } from "../../run-times.ts";
import { type RunDefinitions, runViewDefinitions, stepLines } from "../../run-view.ts";
import { workflowTitle } from "../runs/listed-run.ts";
import { showEnding } from "../runs/show-ending.ts";

/** What the result is about besides the run. */
export interface RunResultFacts {
  readonly workspace: LoadedWorkspace;
  /** The workspace's name, as the heading says it. */
  readonly workspaceName: string;
  /** The user's own `--dir`, repeated in every command the lines suggest. */
  readonly dir: string | undefined;
  readonly clock: RunClock;
}

/**
 * The run's lines and exit code: 0 for a finished run and for one that waits
 * for the user, 1 for a failed one. `--json` gets the run's summary and its
 * events, oldest first, with full ids.
 *
 * @example
 * runResult(run, { workspace, workspaceName: "acme", dir: undefined, clock });
 * // { exitCode: 0, lines: ["Running Support reply in acme · run 01jd8q", "", "✓ Read the email …", …], json: { run, events } }
 */
export function runResult(run: RunDetail, facts: RunResultFacts): CommandResult {
  const { summary, events } = run;
  const definitions = runViewDefinitions(facts.workspace, summary);
  const title = workflowTitle(definitions.workflow, summary);
  const runId = shortRunId(summary.id);
  const steps = stepLines(events, summary, definitions, facts.clock);
  const heading = runMessages.heading(title, facts.workspaceName, runId).phrase;
  return {
    exitCode: summary.status === "failed" ? exitCode.failed : exitCode.ok,
    lines: [
      heading,
      ...(steps.length === 0 ? [] : [[], ...steps]),
      ...ending(run, title, definitions, facts),
    ],
    json: { run: summary, events },
  };
}

/**
 * What stopping with Ctrl C meant for the run (cli-output 1.5): "The run
 * 01jd8q was cancelled after the step Classify it. Nothing after it ran."
 * A run stopped before it finished a step, or before it started, says only
 * "Stopped.".
 */
export function stoppedResult(
  events: readonly RunEvent[],
  workspace: LoadedWorkspace,
): StoppedResult {
  const summary = summarize(events);
  if (summary === null) {
    return { stopped: true, json: {} };
  }
  const definitions = runViewDefinitions(workspace, summary);
  const lastDone = runSteps(events, summary).findLast((step) => step.end.kind === "done");
  const json = { run: summary, events };
  if (lastDone === undefined) {
    return { stopped: true, json };
  }
  const step = stepName(
    lastDone.stateId,
    definitions.workflow?.states[lastDone.stateId]?.description,
  );
  return {
    stopped: true,
    meaning: runMessages.cancelledAfter(shortRunId(summary.id), step).phrase,
    json,
  };
}

/**
 * The lines after the steps, as `halonic runs show` ends the same run, and
 * for a finished run the command that shows its log.
 */
function ending(
  run: RunDetail,
  title: string,
  definitions: RunDefinitions,
  facts: RunResultFacts,
): Phrase[] {
  const models = () => workspaceModelsOf(facts.workspace, run.summary.hubId);
  const lines = showEnding(run, title, definitions, models, facts.dir);
  if (run.summary.status !== "completed") {
    return lines;
  }
  const runLog = runMessages.runLog(shortRunId(run.summary.id), facts.dir).phrase;
  return [...lines, phrase`  ${runLog}`];
}
