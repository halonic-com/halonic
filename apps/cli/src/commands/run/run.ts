// `halonic run <workflow>`: starts the workflow in this workspace's engine
// and follows it until it ends or waits for the user (cli-output 3.4). A
// thin command over `WorkflowRuns` and `RunEvents`, the services the
// Studio's Run and approve buttons use too: this file checks trust, reads
// the input, answers each wait with the next `--event`, and turns the run
// into lines (`result.ts`).

import {
  type FollowOptions,
  hubWorkflows,
  type RunDetail,
  RunEventRefused,
  RunEvents,
  shortRunId,
  WorkflowRuns,
} from "@halonicjs/app";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
  type StoppedResult,
  UsageError,
} from "../../command.ts";
import { followUntilStopped } from "../../follow-run.ts";
import type { LocalEngine } from "../../local-engine-host.ts";
import { errorMessages } from "../../messages/general.ts";
import { runMessages } from "../../messages/run.ts";
import { runsMessages } from "../../messages/runs.ts";
import { stepName } from "../../messages/step-name.ts";
import { workflowMessages } from "../../messages/workflow.ts";
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";
import type { RunClock } from "../../run-times.ts";
import { runViewDefinitions } from "../../run-view.ts";
import { givenDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { openWorkspaceEngine, type WorkspaceEngineSetup } from "../../workspace-engine.ts";
import { runInputOf } from "./input.ts";
import { liveLines } from "./live-lines.ts";
import { runResult } from "./result.ts";
import { checkRunTrust, type RunTrustMachine } from "./trust.ts";

/** What `run` uses on this computer, so tests can fix the clock, the ids and the profile. */
export interface RunSetup extends WorkspaceEngineSetup {
  /** The clock and time zone the step lines' times are written in. */
  clock(): RunClock;
  /** The trust records and the connectors' programs. */
  trust(): RunTrustMachine;
}

/**
 * Runs the workflow and returns its lines: exit 0 when it finished or waits
 * for the user, 1 when it failed. Ctrl C stops following it and returns
 * what stopping meant.
 *
 * @throws UsageError when there isn't exactly one workflow
 * @throws NoWorkspaceError when the folder holds no workspace
 * @throws NotTrustedError when the run could reach more than the test model
 *   and the workspace isn't trusted here; nothing ran
 * @throws RunInputError when `--input` isn't a JSON object
 * @throws OwnLineError when no hub, or more than one, has the workflow
 * @throws OwnLineError when the run doesn't take an `--event` at its wait
 */
export async function runWorkflow(
  input: CommandInput,
  context: CommandContext,
  setup: RunSetup,
): Promise<CommandResult | StoppedResult> {
  const typed = oneWorkflow(input);
  const dir = await openWorkspaceDir(input, context);
  const workspaceName = printable(dir.name);
  const typedDir = givenDir(input, dir);
  const workspace = await loadWorkspace(dir.store);
  await checkRunTrust(dir, workspace, setup.trust(), typedDir);
  const runInput = await runInputOf(optionText(input, "input"), context.cwd);
  const engine = await openWorkspaceEngine(context, setup, {
    dir,
    workspace,
  });
  // One clock for the lines printed while the run goes and the result that repeats them.
  const clock = setup.clock();
  const live = liveLines(context, { workspace, workspaceName, clock });
  try {
    const events = eventsOf(input);
    const run = await followUntilStopped(engine, workspace, (signal) =>
      followWithEvents(engine, workspace, workspaceName, typed, runInput, events, {
        signal,
        onEvent: live.onEvent,
      }),
    );
    if ("stopped" in run) {
      return run;
    }
    return runResult(run, { workspace, workspaceName, dir: typedDir, clock });
  } finally {
    live.end();
    await engine.close();
  }
}

/**
 * Starts the run and, each time it waits for the user, sends the next of
 * `events` and follows it on, until it ends, waits with no event left, or
 * waits for something else. Every follow gets `follow`'s signal and
 * `onEvent`.
 */
async function followWithEvents(
  engine: LocalEngine,
  workspace: LoadedWorkspace,
  name: string,
  typed: string,
  runInput: Record<string, unknown>,
  events: readonly string[],
  follow: Required<Pick<FollowOptions, "signal" | "onEvent">>,
): Promise<RunDetail> {
  const workflowRuns = new WorkflowRuns(engine.executor);
  const started = await workflowRuns.startRun(workspace, typed, runInput, follow);
  if (started.found === "several") {
    throw new OwnLineError(
      "invalid_input",
      workflowMessages.inSeveralHubs(typed, started.hubIds.length),
      workflowMessages.nameTheHub(started.hubIds.map((hubId) => `${hubId}/${typed}`)),
    );
  }
  if (started.found === "none") {
    throw noWorkflow(workspace, typed, name);
  }
  const runEvents = new RunEvents(engine.executor, engine.runs);
  let run = started.run;
  for (const event of events) {
    if (run.summary.status !== "waiting") break;
    const before = run.summary.lastSeq;
    const sent = await sendEvent(runEvents, workspace, run, event);
    run = await workflowRuns.follow(run.summary.id, { ...follow, after: before });
    // Someone else answered the wait first, such as in Studio: show where the run is now.
    if (!sent) break;
  }
  return run;
}

/**
 * Sends one `--event`. An event the step doesn't take reads as `runs
 * send`'s refusal, with the same words.
 *
 * @returns false when the run no longer waited for it: someone answered first
 */
async function sendEvent(
  runEvents: RunEvents,
  workspace: LoadedWorkspace,
  run: RunDetail,
  event: string,
): Promise<boolean> {
  try {
    await runEvents.sendEvent(run.summary.id, event);
    return true;
  } catch (error) {
    if (!(error instanceof RunEventRefused)) throw error;
    const { refusal } = error;
    if (refusal.reason !== "event-not-taken") return false;
    const states = runViewDefinitions(workspace, run.summary).workflow?.states;
    const step = stepName(refusal.step, states?.[refusal.step]?.description);
    throw eventNotTaken(event, shortRunId(run.summary.id), step, refusal.accepts);
  }
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

/** "✕ There's no workflow called "suport-reply" in acme." with the near one when there is one. */
function noWorkflow(workspace: LoadedWorkspace, typed: string, name: string): OwnLineError {
  const near = nearMatch(
    typed,
    hubWorkflows(workspace).map((each) => each.workflow.id),
  );
  return new OwnLineError(
    "not_found",
    workflowMessages.noWorkflow(typed, name),
    near === undefined ? workflowMessages.seeWorkflows() : workflowMessages.workflowNear(near),
  );
}

/** The one argument, the workflow as typed; else the usage error with the usage line. */
function oneWorkflow(input: CommandInput): string {
  const [workflow, ...more] = input.positionals;
  if (workflow === undefined || more.length > 0) {
    throw new UsageError(runMessages.takesOneWorkflow(input.positionals));
  }
  return workflow;
}

function optionText(input: CommandInput, name: string): string | undefined {
  const value = input.options[name];
  return typeof value === "string" ? value : undefined;
}

/** The `--event`s, in the order given. */
function eventsOf(input: CommandInput): string[] {
  const value = input.options["event"];
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.filter((each): each is string => typeof each === "string");
}
