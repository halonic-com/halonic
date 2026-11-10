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
  RunEvents,
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
import { runMessages } from "../../messages/run.ts";
import { workflowMessages } from "../../messages/workflow.ts";
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";
import type { RunClock } from "../../run-times.ts";
import { givenDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { openWorkspaceEngine, type WorkspaceEngineSetup } from "../../workspace-engine.ts";
import { runInputOf } from "./input.ts";
import { liveLines } from "./live-lines.ts";
import { runResult } from "./result.ts";
import { type RunPlace, sendEvent } from "./send-event.ts";
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
 * @throws OwnLineError when the run doesn't take an `--event` at its wait,
 *   or is gone when one is sent
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
    const place = { workspace, name: workspaceName, dir: typedDir };
    const followed = await followUntilStopped(
      engine,
      workspace,
      (signal) =>
        followWithEvents(engine, place, typed, runInput, events, {
          signal,
          onEvent: live.onEvent,
        }),
      typedDir,
    );
    if ("stopped" in followed) {
      return followed;
    }
    const { run, unusedEvents } = followed;
    return runResult(run, { workspace, workspaceName, dir: typedDir, clock, unusedEvents });
  } finally {
    live.end();
    await engine.close();
  }
}

/** The run where the command left it, and the `--event`s it never took. */
interface FollowedRun {
  readonly run: RunDetail;
  /** The events still to send when the run ended, in the order given. */
  readonly unusedEvents: readonly string[];
}

/**
 * Starts the run and, each time it waits for the user, sends the next of
 * `events` and follows it on, until it ends, waits with no event left, or
 * waits for something else. Every follow gets `follow`'s signal and
 * `onEvent`.
 */
async function followWithEvents(
  engine: LocalEngine,
  place: RunPlace,
  typed: string,
  runInput: Record<string, unknown>,
  events: readonly string[],
  follow: Required<Pick<FollowOptions, "signal" | "onEvent">>,
): Promise<FollowedRun> {
  const { workspace } = place;
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
    throw noWorkflow(workspace, typed, place.name);
  }
  const runEvents = new RunEvents(engine.executor, engine.runs);
  let run = started.run;
  let used = 0;
  for (const event of events) {
    if (run.summary.status !== "waiting") break;
    const before = run.summary.lastSeq;
    const sent = await sendEvent(runEvents, place, run, event);
    run = await workflowRuns.follow(run.summary.id, { ...follow, after: before });
    // Someone else answered the wait first, such as in Studio: show where the run is now.
    if (!sent) break;
    used += 1;
  }
  const ended = run.summary.status === "completed" || run.summary.status === "failed";
  return { run, unusedEvents: ended ? events.slice(used) : [] };
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
