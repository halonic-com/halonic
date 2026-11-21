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
  type RunProposal,
  shortRunId,
  WorkflowRuns,
  workflowIn,
} from "@halonicjs/app";
import type { RunVersion } from "@halonicjs/events";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
  type StoppedResult,
  UsageError,
} from "../../command.ts";
import { connectorFileOf } from "../../connector-file.ts";
import { followUntilStopped } from "../../follow-run.ts";
import { type HarnessProgram, nodeHarnessPrograms } from "../../harness-programs.ts";
import type { LocalEngine } from "../../local-engine-host.ts";
import { openLocalProposals } from "../../local-proposals.ts";
import type { Message } from "../../messages/define.ts";
import type { Phrase } from "../../messages/phrase.ts";
import { proposalsMessages } from "../../messages/proposals.ts";
import { runMessages } from "../../messages/run.ts";
import { workflowMessages } from "../../messages/workflow.ts";
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";
import type { RunClock } from "../../run-times.ts";
import { loadRunWorkspace, type OpenWorkspaceHistory } from "../../run-workspace.ts";
import {
  programAgentsOf,
  type SandboxGateRun,
  SandboxRefusedError,
  type UnsandboxedAgent,
  unsandboxedWarning,
} from "../../sandbox-gate.ts";
import { givenDir, type OpenWorkspaceDir, openWorkspaceDir } from "../../workspace-dir.ts";
import {
  checkEngineRuns,
  type EngineRunsTarget,
  openWorkspaceEngine,
  type WorkspaceEngineSetup,
} from "../../workspace-engine.ts";
import { misplacedFilesOf, refuseFileProblems } from "../../workspace-problems.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";
import { connectorWarnings } from "./connector-warnings.ts";
import { eventLines } from "./event-lines.ts";
import { runHarnessOf } from "./harness.ts";
import { checkFirstStepInput, runInputOf } from "./input.ts";
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
 * @throws WorkspaceFileProblemsError when `halonic validate` would find an
 *   error in the workspace's files; nothing ran (exit 2)
 * @throws OwnLineError `conflict` when the workspace has history but nothing
 *   is live yet; nothing ran
 * @throws HistoryUnavailableError when the workspace has history but git
 *   can't start; nothing ran
 * @throws NotTrustedError when the run could reach more than the test model
 *   and the workspace isn't trusted here; nothing ran
 * @throws RunInputError when `--input` isn't a JSON object, or lacks a
 *   field the first step reads
 * @throws RunHarnessError when `--harness` names no harness, or one whose
 *   program can't start here; nothing ran
 * @throws OwnLineError when no hub, or more than one, has the workflow
 * @throws SandboxRefusedError when an agent needs the sandbox and it can't
 *   start here; nothing ran. No option skips this check
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
  const typedDir = givenDir(input, dir);
  const { workspace, version, changesNotLive } = await liveWorkspace(dir, setup);
  const workspaceName = printable(workspaceNameOf(workspace, dir));
  // Before the lookup: a file with an error is left out, so its workflow
  // would look missing (HAL-12978). The trust check below refuses it too.
  refuseFileProblems(dir, workspace, runMessages.nothingRan(), typedDir);
  const harness = await runHarnessOf(
    optionText(input, "harness"),
    (setup.harnesses ?? nodeHarnessPrograms)(),
  );
  const workflow = workflowToRun(workspace, typed, { name: workspaceName, dir: typedDir }, harness);
  const target = {
    holder: "run" as const,
    dir,
    workspace,
    runs: [workflow],
    ending: runMessages.nothingRan(),
  };
  // Before trust: a run the sandbox can't start has nothing to trust (HAL-6580).
  const sandboxChecked = await checkHarnessAgents(setup, target, workflow);
  const trust = await checkRunTrust(
    dir,
    workspace,
    setup.trust(),
    typedDir,
    runMessages.nothingRan(),
    harness,
  );
  const givenInput = optionText(input, "input");
  const runInput = await runInputOf(givenInput, context.cwd);
  const definition = workflowIn(hubWorkflows(workspace), workflow.hubId, workflow.workflowId);
  if (definition !== undefined) {
    checkFirstStepInput(definition, runInput, givenInput !== undefined);
  }
  const engine = await openWorkspaceEngine(context, setup, {
    ...target,
    trust,
    ...(sandboxChecked === undefined ? {} : { sandboxChecked }),
  });
  // Before the run's heading, and again first in the result, as print-ahead lines are.
  const warnings: Phrase[] = [
    ...(changesNotLive ? [runMessages.changesNotLive().phrase] : []),
    ...engine.unsandboxed.map(unsandboxedWarning),
  ];
  for (const line of warnings) context.printAhead(line);
  // One clock for the lines printed while the run goes and the result that repeats them.
  const clock = setup.clock();
  const live = liveLines(context, { workspace, workspaceName, clock });
  // `--json --follow`: the events are printed as they happen, so the result holds only the run.
  const streaming = input.options["follow"] === true;
  let followed: FollowedRun | StoppedResult;
  const printEvent = streaming ? eventLines(context) : live.onEvent;
  const warnConnectors = connectorWarnings(context, typedDir, (id) =>
    connectorFileOf(workspace, id),
  );
  try {
    const events = eventsOf(input);
    const place = { workspace, name: workspaceName, dir: typedDir };
    followed = await followUntilStopped(
      engine,
      workspace,
      (signal) =>
        followWithEvents(engine, place, { workflow, input: runInput, version }, events, {
          signal,
          onEvent: (event, events) => {
            warnConnectors(event);
            printEvent(event, events);
          },
        }),
      typedDir,
    );
  } finally {
    live.end();
    // Closing waits for the run's proposal folder to end, so its proposal is recorded after it.
    await engine.close();
  }
  if ("stopped" in followed) {
    return followed;
  }
  const { run, unusedEvents } = followed;
  const result = runResult(run, {
    workspace,
    workspaceName,
    dir: typedDir,
    clock,
    unusedEvents,
    debugging: context.debugging === true,
  });
  const proposal = await waitingProposal(dir, run, setup, typedDir);
  const json = {
    ...(streaming ? { run: run.summary } : result.json),
    ...(proposal === undefined ? {} : { proposal: proposal.json }),
  };
  const lines = [...warnings, ...result.lines, ...(proposal?.lines ?? [])];
  return { ...result, json, lines };
}

/** What the command starts: the workflow, its input, and the version of the workspace it reads. */
interface RunToStart {
  /** The workflow the sandbox was checked for, with the harness for all its agents. */
  readonly workflow: SandboxGateRun;
  readonly input: Record<string, unknown>;
  /** Recorded on the run's `run.started` (`app.run-records-its-version`). */
  readonly version: RunVersion;
}

/** The run where the command left it, and the `--event`s it never took. */
interface FollowedRun {
  readonly run: RunDetail;
  /** The events still to send when the run ended, in the order given. */
  readonly unusedEvents: readonly string[];
}

/**
 * Starts `start` and, each time it waits for the user, sends the next of
 * `events` and follows it on, until it ends, waits with no event left, or
 * waits for something else. Every follow gets `follow`'s signal and
 * `onEvent`.
 */
async function followWithEvents(
  engine: LocalEngine,
  place: RunPlace,
  start: RunToStart,
  events: readonly string[],
  follow: Required<Pick<FollowOptions, "signal" | "onEvent">>,
): Promise<FollowedRun> {
  const { workspace } = place;
  const { workflow, input, version } = start;
  const workflowRuns = new WorkflowRuns(engine.executor);
  // The workflow the sandbox was checked for, by its hub, so it is the one that starts.
  const typed = `${workflow.hubId}/${workflow.workflowId}`;
  const started = await workflowRuns.startRun(workspace, typed, input, {
    ...follow,
    version,
    ...(workflow.harness === undefined ? {} : { harness: workflow.harness }),
  });
  if (started.found !== "one") {
    throw noWorkflow(workspace, typed, place);
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
  shown: ShownWorkspace,
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
    throw noWorkflow(workspace, typed, shown);
  }
  const run = { hubId: lookup.hubId, workflowId: lookup.workflow.id };
  return harness === undefined ? run : { ...run, harness };
}

/**
 * Checks the sandbox for a workflow with an agent in a harness before the
 * trust check, so a computer whose sandbox can't start says so first and
 * shows no trust check for a run that can't start (HAL-5219, HAL-6580).
 * The engine then reuses the answer. A workflow with no such agent is
 * checked where the engine opens, as before.
 *
 * @returns the check's answer, or `undefined` when no agent is in a harness
 * @throws KindedError `invalid_input` when the run's harness would move an
 *   agent no check read into a program (exit 2)
 * @throws SandboxRefusedError when such an agent needs the sandbox and it
 *   can't start here (exit 9), with the hint that `--harness halonic` runs
 *   the workflow without it
 */
async function checkHarnessAgents(
  setup: RunSetup,
  target: EngineRunsTarget,
  workflow: SandboxGateRun,
): Promise<UnsandboxedAgent[] | undefined> {
  if (programAgentsOf(target.workspace, workflow).length === 0) return undefined;
  try {
    return await checkEngineRuns(setup, target);
  } catch (error) {
    if (error instanceof SandboxRefusedError) {
      throw error.withHint(runMessages.sandboxRefusedHarnessHint());
    }
    throw error;
  }
}

/**
 * The line that says the run left a proposal and how to see it, after a
 * run that ended with changes (HAL-6477): nothing in the person's files
 * changed, so they decide with `halonic proposals`. Read once the engine
 * has closed, since the run's folder ends just after its last event.
 */
async function waitingProposal(
  dir: OpenWorkspaceDir,
  run: RunDetail,
  setup: RunSetup,
  typedDir: string | undefined,
): Promise<{ readonly lines: Phrase[]; readonly json: RunProposal } | undefined> {
  const { status, id } = run.summary;
  if (status !== "completed" && status !== "failed") return undefined;
  const { proposals, close } = await openLocalProposals(dir.root, {
    ...(setup.profile === undefined ? {} : { profile: setup.profile }),
    ...(setup.engine?.git === undefined ? {} : { git: setup.engine.git }),
  });
  try {
    const record = await proposals.get(id);
    if (record === null || record.settled !== undefined) return undefined;
    const files = record.proposal.files.length;
    const line = proposalsMessages.waiting(shortRunId(id), files, typedDir).phrase;
    return { lines: [[], line], json: record.proposal };
  } finally {
    await close();
  }
}

/** The workspace as the messages name it, and the user's own `--dir` for a suggested command. */
type ShownWorkspace = Pick<RunPlace, "name" | "dir">;

/**
 * "✕ There's no workflow called "suport-reply" in Acme." with the near one
 * when there is one. Else, when the loader skipped files for their folder
 * or name, it points at `halonic validate`, since the workflow may be among
 * them (HAL-14297); else it lists the workflows there are.
 */
function noWorkflow(
  workspace: LoadedWorkspace,
  typed: string,
  shown: ShownWorkspace,
): OwnLineError {
  return new OwnLineError(
    "not_found",
    workflowMessages.noWorkflow(typed, shown.name),
    noWorkflowFix(workspace, typed, shown),
  );
}

/** Line 2 under {@link noWorkflow}. */
function noWorkflowFix(workspace: LoadedWorkspace, typed: string, shown: ShownWorkspace): Message {
  const ids = hubWorkflows(workspace).map((each) => each.workflow.id);
  const near = nearMatch(typed, ids);
  if (near !== undefined) {
    return workflowMessages.workflowNear(near);
  }
  const skipped = misplacedFilesOf(workspace);
  if (skipped > 0) {
    return workflowMessages.skippedFiles(shown.name, skipped, shown.dir);
  }
  return workflowMessages.seeWorkflows(shown.name, ids);
}

/**
 * The workspace the run starts: the live version, or the saved files with
 * history off; the version the run records; and whether saved definition
 * changes aren't in it.
 *
 * @throws OwnLineError `conflict` when nothing is live yet
 */
async function liveWorkspace(
  dir: OpenWorkspaceDir,
  setup: Pick<RunSetup, "history" | "profile">,
): Promise<{
  readonly workspace: LoadedWorkspace;
  readonly version: RunVersion;
  readonly changesNotLive: boolean;
}> {
  const run = await loadRunWorkspace(dir, setup.history, runMessages.nothingRan(), setup.profile);
  if (run.found === "nothing-live") {
    throw new OwnLineError("conflict", runMessages.nothingLive(), runMessages.nothingLiveFix());
  }
  return run;
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
