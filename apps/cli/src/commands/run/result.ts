// What `halonic run` prints once the run has ended or waits for the user
// (cli-output 3.4): the heading, the step lines, then the finished run's
// receipt, the waiting lines or the failed run's two lines and receipt. It is worked out
// from the run log alone, through the same helpers `halonic runs show` uses,
// so both say the same about a run. The words are the catalogue's.

import { type RunDetail, shortRunId } from "@halonicjs/app";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { CommandResult } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { dimmed, markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { runMessages } from "../../messages/run.ts";
import { workspaceModelsOf } from "../../run-failure-of.ts";
import type { RunClock } from "../../run-times.ts";
import { type RunDefinitions, runViewDefinitions, stepColumns, stepLines } from "../../run-view.ts";
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
  /** The `--event`s the run ended before it took, said in one dim line at the end. */
  readonly unusedEvents?: readonly string[];
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
  const steps = runStepLines(events, summary, definitions, facts.clock);
  const heading = runHeading(summary, definitions, facts.workspaceName);
  return {
    exitCode: summary.status === "failed" ? exitCode.failed : exitCode.ok,
    lines: [
      heading,
      ...(steps.length === 0 ? [] : [[], ...steps]),
      ...ending(run, title, definitions, facts),
      ...unusedEventsLines(facts.unusedEvents ?? []),
    ],
    json: { run: summary, events },
  };
}

/** "Running Support reply in acme · run 01jd8q": the first line, printed as soon as the run starts. */
export function runHeading(
  summary: RunSummary,
  definitions: RunDefinitions,
  workspaceName: string,
): Phrase {
  const title = workflowTitle(definitions.workflow, summary);
  return runMessages.heading(title, workspaceName, shortRunId(summary.id)).phrase;
}

/**
 * The step lines, in the workflow's own columns rather than those of the
 * steps that ran: a step's line is printed as soon as it ends, and the
 * result repeats it word for word (`live-lines.ts`).
 */
export function runStepLines(
  events: readonly RunEvent[],
  summary: RunSummary,
  definitions: RunDefinitions,
  clock: RunClock,
): Phrase[] {
  return stepLines(events, summary, definitions, clock, stepColumns(definitions));
}

/** "! Didn't use --event reject: the run ended first.", dim, after a blank line. */
function unusedEventsLines(events: readonly string[]): Phrase[] {
  if (events.length === 0) {
    return [];
  }
  return [[], dimmed(phrase`${markPart("needsYou")} ${runMessages.unusedEvents(events).phrase}`)];
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
