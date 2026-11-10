// `halonic runs show <run-id>`: what one run did, read from its run log
// (cli-output 3.4, C174 on HAL-2000). A thin command over `RunHistory`, the
// service the Studio's run page reads too: this file finds the run by the id
// the user typed, and prints the heading, the step lines and, once the run
// has finished, its receipt (`run-view.ts`, shared with `halonic run`). It never prints
// where the run log is (Liam, HAL-1984). The words are the catalogue's
// (`runsMessages`).

import { hubWorkflows, type RunDetail, RunHistory, shortRunId, workflowIn } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { definitionsOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { duration } from "../../messages/duration.ts";
import { markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { runMessages } from "../../messages/run.ts";
import { runsMessages, type ShownEnd } from "../../messages/runs.ts";
import { startedInWords } from "../../messages/runs-list.ts";
import { stepName } from "../../messages/step-name.ts";
import { type RunClock, startedAt } from "../../run-times.ts";
import { type RunDefinitions, receiptOf, stepLines } from "../../run-view.ts";
import { givenDir, type OpenWorkspaceDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import type { RunListSetup } from "./list.ts";
import { listedStatus, waitDescription } from "./listed-run.ts";

/**
 * Shows one run, real or test: its heading, then its steps. Exits 0 for any
 * run it finds, failed or not: the command worked, it showed a run. With
 * `--json`, the run's events, oldest first, with full ids.
 *
 * @throws UsageError when there isn't exactly one run id
 * @throws OwnLineError when no run has that id (`not_found`), or two runs end
 *   in that short id (`invalid_input`)
 * @throws NoWorkspaceError when the folder holds no workspace
 */
export async function showRun(
  input: CommandInput,
  context: CommandContext,
  setup: RunListSetup,
): Promise<CommandResult> {
  const typed = oneRunId(input);
  const workspace = await openWorkspaceDir(input, context);
  const history = new RunHistory(await openWorkspaceRuns(workspace.root, setup.profile));
  const lookup = await history.showRun(typed);
  const dir = givenDir(input, workspace);
  switch (lookup.found) {
    case "none":
      throw new OwnLineError(
        "not_found",
        runsMessages.showNoRun(typed, workspace.name),
        runsMessages.showNoRunFix(dir),
      );
    case "several":
      throw new OwnLineError(
        "invalid_input",
        runsMessages.showSeveralRuns(lookup.shortId, workspace.name),
        runsMessages.severalRunsFix(dir),
      );
    case "one": {
      const { run } = lookup;
      const definitions = runDefinitions(await loadWorkspace(workspace.store), run.summary);
      const title = definitions.workflow?.name ?? run.summary.workflowId;
      const clock = setup.clock();
      const steps = stepLines(run.events, run.summary, definitions, clock);
      return {
        exitCode: exitCode.ok,
        lines: [
          heading(run, title, workspace, clock),
          ...(steps.length === 0 ? [] : [[], ...steps]),
          ...ending(run, title, definitions, dir),
        ],
        json: { events: run.events },
      };
    }
  }
}

/** The one argument, the run id as typed; else the usage error with the usage line. */
function oneRunId(input: CommandInput): string {
  const [runId, ...more] = input.positionals;
  if (runId === undefined || more.length > 0) {
    throw new UsageError(runsMessages.showTakesOneRunId(input.positionals));
  }
  return runId;
}

/**
 * The definitions the run's steps are named by, from its own hub. A hub
 * that's no longer in the workspace leaves the workflow and its agents
 * unknown, so the steps are named by their ids.
 */
function runDefinitions(loaded: LoadedWorkspace, summary: RunSummary): RunDefinitions {
  const workflow = workflowIn(hubWorkflows(loaded), summary.hubId, summary.workflowId);
  if (workflow === undefined) {
    return { workflow, agent: () => undefined };
  }
  const { agents } = definitionsOf(loaded, summary.hubId);
  return {
    workflow,
    agent: (agentId) => (Object.hasOwn(agents, agentId) ? agents[agentId] : undefined),
  };
}

/**
 * What follows the step lines: a finished run's "✓ Support reply finished
 * in 18 s." and the receipt under it, as a finished `halonic run` ends, or
 * a waiting run's two waiting lines. A running run ends with its step
 * lines. A failed or stopped run's ✕ lines come with `run`'s own (HAL-2742).
 */
function ending(
  run: RunDetail,
  title: string,
  definitions: RunDefinitions,
  dir: string | undefined,
): Phrase[] {
  switch (run.summary.status) {
    case "completed":
      return finishedEnding(run, title);
    case "waiting":
      return waitingEnding(run.summary, definitions, dir);
    default:
      return [];
  }
}

/**
 * A run waiting at a wait step ends with `run`'s two waiting lines, word for
 * word (cli-output 3.4): "! Waiting for you: Approve this reply?" and how to
 * answer. A run waiting for a tool approval, its child run or a time has no
 * such lines in 3.4; its step line already says what it waits for.
 */
function waitingEnding(
  summary: RunSummary,
  definitions: RunDefinitions,
  dir: string | undefined,
): Phrase[] {
  const waitsAtAWaitStep =
    summary.approvals.length === 0 && summary.waitingOn === null && summary.accepts.length > 0;
  if (!waitsAtAWaitStep || summary.state === null) {
    return [];
  }
  const description = waitDescription(summary, definitions.workflow);
  const waiting =
    description === undefined
      ? runMessages.waitingInStep(
          stepName(summary.state, definitions.workflow?.states[summary.state]?.description),
        )
      : runMessages.waitingForYou(description);
  const answer = runMessages.answerHere(shortRunId(summary.id), summary.accepts, dir);
  return [[], phrase`${markPart("needsYou")} ${waiting.phrase}`, phrase`  ${answer.phrase}`];
}

/** "✓ Support reply finished in 18 s." and the receipt under it. */
function finishedEnding(run: RunDetail, title: string): Phrase[] {
  const { summary } = run;
  const took = Date.parse(summary.endedAt ?? summary.updatedAt) - Date.parse(summary.startedAt);
  const receipt = runMessages.receipt(receiptOf(run.events, summary)).phrase;
  return [
    [],
    phrase`${markPart("done")} ${runMessages.finished(title, duration(took)).phrase}`,
    ...(receipt.length === 0 ? [] : [phrase`  ${receipt}`]),
  ];
}

/** "Support reply in acme · run 01jd8q · started 14:01, finished 14:02". */
function heading(
  run: RunDetail,
  title: string,
  workspace: OpenWorkspaceDir,
  clock: RunClock,
): Phrase {
  const { summary } = run;
  const started = startedInWords(startedAt(new Date(summary.startedAt), clock));
  return runsMessages.showHeading(
    title,
    workspace.name,
    { id: shortRunId(summary.id), test: summary.kind === "test" },
    started,
    shownEnd(summary, clock),
  ).phrase;
}

/**
 * How the heading ends. A failed run that kept to its budget or was
 * cancelled reads "stopped", as the list's status word does.
 */
function shownEnd(summary: RunSummary, clock: RunClock): ShownEnd {
  const at = (iso: string) => startedInWords(startedAt(new Date(iso), clock));
  switch (summary.status) {
    case "running":
      return { status: "running" };
    case "waiting":
      return { status: "waiting", since: at(summary.lastWaitingAt ?? summary.startedAt) };
    case "completed":
      return { status: "finished", at: at(summary.endedAt ?? summary.updatedAt) };
    case "failed":
      return {
        status: listedStatus(summary) === "stopped" ? "stopped" : "failed",
        at: at(summary.endedAt ?? summary.updatedAt),
      };
  }
}
