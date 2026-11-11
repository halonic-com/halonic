// `halonic runs send <run-id> <event>`: answers a run that's waiting for the
// user (cli-output 3.4, C174 on HAL-2000, C224 on HAL-2588). A thin command
// over two services: `RunHistory` finds the run by the id the user typed,
// and `RunEvents` sends the event only while the run waits for it, the rule
// `halonic run --event` and the Studio's approve button share. The engine
// is local, so the command then follows the run in this process until it
// ends or waits again, and prints it as `halonic run` does after its heading
// (HAL-4031). This file turns the service's refusals into the catalogue's
// sentences (`runsMessages`) and never words one of its own.

import {
  hubWorkflows,
  type RunDetail,
  type RunEventRefusal,
  RunEventRefused,
  RunEvents,
  RunHistory,
  shortRunId,
  type WorkflowDefinition,
  WorkflowRuns,
  workflowIn,
} from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import type { RunExecutor } from "@halonicjs/ports";
import { assertDefined, KindedError } from "@halonicjs/std";
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
import type { Message } from "../../messages/define.ts";
import { errorMessages } from "../../messages/general.ts";
import { markPart, phrase, plainText } from "../../messages/phrase.ts";
import { type NotWaiting, runsMessages } from "../../messages/runs.ts";
import { endedInWords } from "../../messages/runs-list.ts";
import { sandboxMessages } from "../../messages/sandbox.ts";
import { stepName } from "../../messages/step-name.ts";
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";
import { endedAt, type RunClock } from "../../run-times.ts";
import type { SandboxGateRun } from "../../sandbox-gate.ts";
import { givenDir, type OpenWorkspaceDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { openWorkspaceEngine, type WorkspaceEngine } from "../../workspace-engine.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import { liveLines } from "../run/live-lines.ts";
import { runProgress } from "../run/result.ts";
import type { RunSetup } from "../run/run.ts";
import { checkRunTrust } from "../run/trust.ts";
import { listedStatus } from "./listed-run.ts";

/** The run id and the event, as the user typed them. */
interface SendArguments {
  readonly typed: string;
  readonly event: string;
}

/**
 * Sends the event to the waiting run, says it goes on, and follows it until
 * it ends or waits again: exit 0 then, 1 when it fails after the event. With
 * `--json`, the run and its events as they are then. Ctrl C stops following
 * it and returns what stopping meant.
 *
 * @throws UsageError without exactly a run id and an event
 * @throws OwnLineError when no run has that id (`not_found`), or two runs end
 *   in that short id (`invalid_input`)
 * @throws KindedError when the run isn't waiting (`conflict`), or its step
 *   doesn't take the event (`invalid_input`)
 * @throws NoWorkspaceError when the folder holds no workspace
 * @throws NotTrustedError when the run could reach more than the test model
 *   and the workspace isn't trusted here; nothing was sent (exit 3)
 */
export async function sendToRun(
  input: CommandInput,
  context: CommandContext,
  setup: RunSetup,
): Promise<CommandResult | StoppedResult> {
  const { typed, event } = sendArguments(input);
  const workspace = await openWorkspaceDir(input, context);
  const runs = await openWorkspaceRuns(workspace.root, setup.profile);
  const dir = givenDir(input, workspace);
  const lookup = await new RunHistory(runs).showRun(typed);
  switch (lookup.found) {
    case "none":
      throw noRunError(event, typed, workspace, dir);
    case "several":
      throw new OwnLineError(
        "invalid_input",
        withoutRun(event, runsMessages.severalRuns(lookup.shortId, workspace.name)),
        runsMessages.severalRunsFix(dir),
      );
    case "one":
      break;
  }
  const { summary } = lookup.run;
  const loaded = await loadWorkspace(workspace.store);
  const workflow = workflowOf(loaded, summary);
  // One clock for the lines printed while the run goes and the result that repeats them.
  const facts = {
    workspace: loaded,
    workspaceName: printable(workspace.name),
    dir,
    clock: setup.clock(),
  };
  const engine = new EngineOnSend(context, setup, {
    dir: workspace,
    workspace: loaded,
    run: sandboxRunOf(lookup.run),
    typedDir: dir,
  });
  // After 3.4's line, the steps as `halonic run` prints them while it goes; no heading.
  const live = liveLines(context, { ...facts, heading: false });
  try {
    let run: RunSummary;
    try {
      run = await new RunEvents(engine, runs).sendEvent(summary.id, event);
    } catch (error) {
      if (!(error instanceof RunEventRefused)) throw error;
      const refused = { event, typed, workspace, dir, workflow, clock: facts.clock };
      throw refusedError(error.refusal, refused);
    }
    const sent = phrase`${markPart("done")} ${runsMessages.sent(event, shortRunId(run.id), workflow?.name ?? run.workflowId).phrase}`;
    context.printAhead(sent);
    const opened = engine.opened();
    const followed = await followUntilStopped(opened, loaded, (signal) =>
      new WorkflowRuns(opened.executor).follow(run.id, {
        after: summary.lastSeq,
        signal,
        onEvent: live.onEvent,
      }),
    );
    if ("stopped" in followed) {
      return followed;
    }
    const progress = runProgress(followed, facts);
    return { ...progress, lines: [sent, ...progress.lines] };
  } finally {
    live.end();
    await engine.close();
  }
}

/** The run a send moves on, in the workspace it was found in. */
interface SendTarget {
  readonly dir: OpenWorkspaceDir;
  readonly workspace: LoadedWorkspace;
  /** The run's hub, workflow and harness, which the sandbox is checked for. */
  readonly run: SandboxGateRun;
  /** The user's own `--dir`, which the trust fix repeats. */
  readonly typedDir: string | undefined;
}

/**
 * The engine a send lets the run go on in, opened only once `RunEvents`
 * knows the run waits for the event, so a refused send checks neither trust
 * nor the sandbox. Both are checked as `halonic run` checks them before it
 * starts a run, with "Nothing was sent." as line 1's end.
 */
class EngineOnSend implements Pick<RunExecutor, "send"> {
  private readonly context: CommandContext;
  private readonly setup: RunSetup;
  private readonly target: SendTarget;
  private engine: WorkspaceEngine | undefined;

  constructor(context: CommandContext, setup: RunSetup, target: SendTarget) {
    this.context = context;
    this.setup = setup;
    this.target = target;
  }

  async send(runId: string, event: string): Promise<RunSummary> {
    const { dir, workspace, run, typedDir } = this.target;
    const nothingSent = sandboxMessages.nothingSent();
    await checkRunTrust(dir, workspace, this.setup.trust(), typedDir, nothingSent);
    this.engine = await openWorkspaceEngine(this.context, this.setup, {
      dir,
      workspace,
      run: { ...run, ending: nothingSent },
    });
    return this.engine.executor.send(runId, event);
  }

  /** The engine the event went to, to follow the run in; opened once the run took the event. */
  opened(): WorkspaceEngine {
    return assertDefined(this.engine, "engine");
  }

  async close(): Promise<void> {
    await this.engine?.close();
  }
}

/** The two arguments; else the usage error with the usage line. */
function sendArguments(input: CommandInput): SendArguments {
  const [typed, event, ...more] = input.positionals;
  if (typed === undefined || event === undefined || more.length > 0) {
    throw new UsageError(runsMessages.sendTakesRunIdAndEvent(input.positionals));
  }
  return { typed, event };
}

/**
 * "Couldn't send approve: there's no run 01JD8X in acme.": with no one run
 * to name, line 1 leaves the run out of the command's action.
 */
function withoutRun(event: string, reason: Message): Message {
  return errorMessages.couldnt(runsMessages.sendActionNoRun(event).phrase, reason.phrase);
}

/** The workflow the run is of, from its own hub, or `undefined` once it's gone. */
function workflowOf(loaded: LoadedWorkspace, summary: RunSummary): WorkflowDefinition | undefined {
  return workflowIn(hubWorkflows(loaded), summary.hubId, summary.workflowId);
}

/**
 * The run as the sandbox check needs it: its hub and workflow, and the
 * harness it named for all its agents when it started (HAL-4305), so the
 * steps after the event are checked in the harness they will run in.
 */
function sandboxRunOf(detail: RunDetail): SandboxGateRun {
  const { hubId, workflowId } = detail.summary;
  const started = detail.events.find((each) => each.type === "run.started");
  const harness = started?.type === "run.started" ? started.harness : undefined;
  return harness === undefined ? { hubId, workflowId } : { hubId, workflowId, harness };
}

/** What a refused send's lines name besides the refusal. */
interface RefusedSend {
  readonly event: string;
  /** The run id as the user typed it, as line 1 and the fixes repeat it. */
  readonly typed: string;
  readonly workspace: OpenWorkspaceDir;
  readonly dir: string | undefined;
  readonly workflow: WorkflowDefinition | undefined;
  readonly clock: RunClock;
}

/**
 * A refusal as the command line prints it, after "Couldn't send approve to
 * run 01JD8Q:", with the one fix (cli-output 3.4).
 */
function refusedError(refusal: RunEventRefusal, send: RefusedSend): Error {
  switch (refusal.reason) {
    // The run was found, so it went away between the lookup and the send.
    case "no-run":
      return noRunError(send.event, send.typed, send.workspace, send.dir);
    case "not-waiting":
      return new RefusedSendError(
        "conflict",
        runsMessages.notWaiting(notWaiting(refusal.run, send.workflow, send.clock)),
        runsMessages.notWaitingFix(send.typed, send.dir),
      );
    case "event-not-taken": {
      const step = stepName(refusal.step, send.workflow?.states[refusal.step]?.description);
      const near = nearMatch(send.event, refusal.accepts);
      return new RefusedSendError(
        "invalid_input",
        runsMessages.eventNotTaken(step, refusal.accepts),
        near === undefined
          ? runsMessages.seeTheStep(send.typed, send.dir)
          : runsMessages.eventNear(near),
      );
    }
  }
}

/** "✕ Couldn't send approve: there's no run 01JD8X in acme.", exit 4. */
function noRunError(
  event: string,
  typed: string,
  workspace: OpenWorkspaceDir,
  dir: string | undefined,
): OwnLineError {
  return new OwnLineError(
    "not_found",
    withoutRun(event, runsMessages.noRun(typed, workspace.name)),
    runsMessages.noRunFix(dir),
  );
}

/**
 * Why the run can't take an event: when it ended, or the step it's
 * running. A failed run that kept to its budget or was cancelled reads
 * "stopped", as the list's status word does.
 */
function notWaiting(
  run: RunSummary,
  workflow: WorkflowDefinition | undefined,
  clock: RunClock,
): NotWaiting {
  if (run.status === "running" || run.status === "waiting") {
    const step = run.state ?? "";
    return { status: "running", step: stepName(step, workflow?.states[step]?.description) };
  }
  const ago = endedInWords(endedAt(new Date(run.endedAt ?? run.updatedAt), clock));
  if (run.status === "completed") {
    return { status: "finished", ago };
  }
  return { status: listedStatus(run) === "stopped" ? "stopped" : "failed", ago };
}

/**
 * A send the run didn't take: `conflict` (exit 5) or `invalid_input` (exit
 * 2). Its message is the reason and its fix the next step; the command's
 * own action makes line 1, "✕ Couldn't send approve to run 01JD8Q: …".
 */
class RefusedSendError extends KindedError {
  constructor(kind: "conflict" | "invalid_input", reason: Message, fix: Message) {
    super(kind, plainText(reason.phrase), { fix: plainText(fix.phrase) });
  }
}
