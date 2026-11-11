// `halonic run <workflow>`: starts the workflow in this workspace's engine
// and follows it until it ends or waits for the user (cli-output 3.4). A
// thin command over `WorkflowRuns` and `RunEvents`, the services the
// Studio's Run and approve buttons use too: this file checks trust, reads
// the input, answers each wait with the next `--event`, and turns the run
// into lines (`result.ts`).

import {
  type FollowOptions,
  hubWorkflows,
  lookUpWorkflow,
  type RunDetail,
  RunEvents,
  WorkflowRuns,
} from "@halonicjs/app";
import { KindedError } from "@halonicjs/std";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
  type StoppedResult,
  UsageError,
} from "../../command.ts";
import { followUntilStopped } from "../../follow-run.ts";
import { type HarnessProgram, nodeHarnessPrograms } from "../../harness-programs.ts";
import type { LocalEngine } from "../../local-engine-host.ts";
import { type Phrase, plainText } from "../../messages/phrase.ts";
import { runMessages } from "../../messages/run.ts";
import { workflowMessages } from "../../messages/workflow.ts";
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";
import type { RunClock } from "../../run-times.ts";
import { loadRunWorkspace, type OpenWorkspaceHistory } from "../../run-workspace.ts";
import { programAgentsOf, type SandboxGateRun, unsandboxedWarning } from "../../sandbox-gate.ts";
import { givenDir, type OpenWorkspaceDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { openWorkspaceEngine, type WorkspaceEngineSetup } from "../../workspace-engine.ts";
import { runHarnessOf } from "./harness.ts";
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
  /** Opens the workspace's history, for its live version; git on the `PATH` by default. */
  readonly history?: OpenWorkspaceHistory;
  /**
   * The harness programs `--harness` may name, other than Halonic's own
   * loop; this computer's, found on the `PATH`, by default.
   */
  harnesses?(): readonly HarnessProgram[];
}

/**
 * Runs the workflow and returns its lines: exit 0 when it finished or waits
 * for the user, 1 when it failed. Ctrl C stops following it and returns
 * what stopping meant.
 *
 * @throws UsageError when there isn't exactly one workflow
 * @throws NoWorkspaceError when the folder holds no workspace
 * @throws OwnLineError `conflict` when the workspace has history but nothing
 *   is live yet; nothing ran
 * @throws HistoryUnavailableError when the workspace has history but git
 *   can't start; nothing ran
 * @throws NotTrustedError when the run could reach more than the test model
 *   and the workspace isn't trusted here; nothing ran
 * @throws RunInputError when `--input` isn't a JSON object
 * @throws RunHarnessError when `--harness` names no harness, or one whose
 *   program can't start here; nothing ran
 * @throws OwnLineError when no hub, or more than one, has the workflow
 * @throws SandboxRefusedError when an agent needs the sandbox and it can't
 *   start here; nothing ran. No option skips this check
 * @throws KindedError `unavailable` when an agent is in a harness, which
 *   this computer's engine can't run yet; nothing ran
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
  const workspace = await liveWorkspace(dir, setup.history);
  const harness = await runHarnessOf(
    optionText(input, "harness"),
    (setup.harnesses ?? nodeHarnessPrograms)(),
  );
  await checkRunTrust(dir, workspace, setup.trust(), typedDir, runMessages.nothingRan(), harness);
  const runInput = await runInputOf(optionText(input, "input"), context.cwd);
  const workflow = workflowToRun(workspace, typed, workspaceName, harness);
  const engine = await openWorkspaceEngine(context, setup, {
    dir,
    workspace,
    runs: [workflow],
    ending: runMessages.nothingRan(),
  });
  try {
    // After the sandbox check, so a computer that can't start the sandbox says so first.
    refuseHarnessAgents(workspace, workflow);
  } catch (error) {
    await engine.close();
    throw error;
  }
  // Before the run's heading, and again first in the result, as print-ahead lines are.
  const warnings: Phrase[] = engine.unsandboxed.map(unsandboxedWarning);
  for (const line of warnings) context.printAhead(line);
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
        followWithEvents(engine, place, workflow, runInput, events, {
          signal,
          onEvent: live.onEvent,
        }),
      typedDir,
    );
    if ("stopped" in followed) {
      return followed;
    }
    const { run, unusedEvents } = followed;
    const result = runResult(run, { workspace, workspaceName, dir: typedDir, clock, unusedEvents });
    return { ...result, lines: [...warnings, ...result.lines] };
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
  workflow: SandboxGateRun,
  runInput: Record<string, unknown>,
  events: readonly string[],
  follow: Required<Pick<FollowOptions, "signal" | "onEvent">>,
): Promise<FollowedRun> {
  const { workspace } = place;
  const workflowRuns = new WorkflowRuns(engine.executor);
  // The workflow the sandbox was checked for, by its hub, so it is the one that starts.
  const typed = `${workflow.hubId}/${workflow.workflowId}`;
  const started = await workflowRuns.startRun(workspace, typed, runInput, {
    ...follow,
    ...(workflow.harness === undefined ? {} : { harness: workflow.harness }),
  });
  if (started.found !== "one") {
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

/**
 * The hub and the workflow `typed` names, and the harness for all its
 * agents, before the engine opens, so the sandbox is checked for the run
 * that starts.
 *
 * @throws OwnLineError when no hub, or more than one, has the workflow
 */
function workflowToRun(
  workspace: LoadedWorkspace,
  typed: string,
  name: string,
  harness: string | undefined,
): SandboxGateRun {
  const lookup = lookUpWorkflow(hubWorkflows(workspace), typed);
  if (lookup.found === "several") {
    throw new OwnLineError(
      "invalid_input",
      workflowMessages.inSeveralHubs(typed, lookup.hubIds.length),
      workflowMessages.nameTheHub(lookup.hubIds.map((hubId) => `${hubId}/${typed}`)),
    );
  }
  if (lookup.found === "none") {
    throw noWorkflow(workspace, typed, name);
  }
  const run = { hubId: lookup.hubId, workflowId: lookup.workflow.id };
  return harness === undefined ? run : { ...run, harness };
}

/**
 * Refuses a workflow with an agent in a harness before anything starts: the
 * engine `run` opens has no harness adapter, so the run would fail at that
 * agent's step.
 *
 * @throws KindedError `unavailable` when an agent of the workflow, or of a
 *   workflow it starts, is in a harness; nothing ran
 */
function refuseHarnessAgents(workspace: LoadedWorkspace, workflow: SandboxGateRun): void {
  const [agent] = programAgentsOf(workspace, workflow);
  if (agent === undefined) return;
  const reason = runMessages.harnessNotAvailable(
    printable(agent.value.name),
    // The run's harness when `--harness` names one, as the run would use it.
    printable(workflow.harness ?? agent.value.harness ?? ""),
  );
  throw new KindedError("unavailable", plainText(reason.phrase), {
    fix: plainText(runMessages.harnessNotAvailableFix().phrase),
  });
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

/**
 * The workspace the run starts: the live version, or the saved files with
 * history off.
 *
 * @throws OwnLineError `conflict` when nothing is live yet
 */
async function liveWorkspace(
  dir: OpenWorkspaceDir,
  history: OpenWorkspaceHistory | undefined,
): Promise<LoadedWorkspace> {
  const run = await loadRunWorkspace(dir, history);
  if (run.found === "nothing-live") {
    throw new OwnLineError("conflict", runMessages.nothingLive(), runMessages.nothingLiveFix());
  }
  return run.workspace;
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
