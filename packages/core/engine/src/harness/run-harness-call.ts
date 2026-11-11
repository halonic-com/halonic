// Carries out one `run-harness` effect: it finds where the agent runs, opens
// the run's bridge and sandbox, starts the harness in them and writes what
// the harness reports, and what its sandbox refused, to the run's log. It
// gives back the agent's result; `decide` writes the task's own
// `agent.finished` from it, as it does for a model's answer. When the
// harness asks for a person's OK, the call keeps running and waits for the
// answer. Whatever the harness started is stopped before it returns, and
// also when the engine stops it on the way.

import { type DeniedPathGroup, type RunEventBody, sandboxOpenedView } from "@halonicjs/events";
import type { Agent } from "@halonicjs/format";
import {
  addHarnessEnvironment,
  type Harness,
  type HarnessEvent,
  type HarnessRun,
  type OpenHarnessBridge,
  RunFailureError,
  type Sandbox,
  type SandboxSession,
} from "@halonicjs/ports";
import type { StopSignal } from "@halonicjs/std";
import type { RunHarnessEffect } from "../kernel/decide-types.ts";
import { SandboxNotReadyError } from "../run/sandbox-not-ready-error.ts";
import { BlockedAccesses } from "./blocked-accesses.ts";
import type { HarnessAgent, HarnessRunsOptions, PlacementAnswer } from "./harness-host.ts";
import { defaultStartTimeoutsMs, type StartLimits, type StartPhase } from "./start-limits.ts";
import { unlessStopped } from "./unless-stopped.ts";

/** Where a harness call writes its events: the run's log, one event after the other. */
export interface HarnessEventLog {
  /** @throws when the event can't be stored; the call stops there */
  append(event: RunEventBody): Promise<void>;
  /** Resolves once every append given so far has been stored or has failed. */
  settled(): Promise<void>;
  /**
   * Runs `work` once every append given so far has been stored or has
   * failed, and holds every append given meanwhile until `work` settles.
   *
   * @returns what `work` gives back
   * @throws what `work` throws
   */
  whileHeld<T>(work: () => Promise<T>): Promise<T>;
}

/** A person's answer to an approval a harness call asked for. */
export interface HarnessAnswer {
  readonly approved: boolean;
  /** What the person wrote with the answer, if anything. */
  readonly comment?: string;
}

/** What a harness asks a person to approve: one of its program's tool calls. */
export interface HarnessQuestion {
  readonly tool: string;
  readonly args: unknown;
}

/** Where a harness call asks a person for an OK. */
export interface HarnessApprovals {
  /**
   * Records the question in the run, which then waits for the person, and
   * resolves with their answer. The harness call keeps running meanwhile.
   *
   * @throws when the run doesn't take the question, or the engine stops the call before an answer comes
   */
  ask(question: HarnessQuestion): Promise<HarnessAnswer>;
}

/** One harness call: the effect `decide` asked for, the run it belongs to and the agent's file. */
export interface HarnessCall {
  readonly effect: Omit<RunHarnessEffect, "type">;
  readonly runId: string;
  readonly hubId: string;
  /** The agent's file as the run started with it. */
  readonly agent: Agent;
  /** Where the agent writes workspace files, as {@link HarnessAgent.filesFolder} says. */
  readonly filesFolder: string | null;
}

/**
 * Runs the agent of one harness call to its result.
 *
 * It never runs a harness without its sandbox: when the sandbox for the
 * agent's placement isn't ready, the call fails before anything starts.
 * Neither start waits for ever: `limits` ends the sandbox's opening and the
 * wait for the harness's first event when their time is up. When `stop` is
 * told to stop, as it is when the engine stops, the call stops the harness run,
 * closes the session and the bridge, and throws.
 *
 * When the harness asks for an approval, the call asks `approvals` and
 * passes the person's answer to the harness under the harness's own call
 * id, which never leaves the call. While the run waits for the person,
 * nothing times out, as for the built-in loop.
 *
 * Each access the sandbox refuses is counted, and written to the log as
 * `sandbox.blocked`: a target's first block at once, and its total when the
 * session has closed, unless the engine stopped the call.
 *
 * It returns, or throws, only once the harness run, the session and the
 * bridge have stopped, in that order, and every event they reported is in
 * the log.
 *
 * @returns the `output` of the agent's own `agent.finished`
 * @throws RunFailureError `sandbox-start-failed` when the sandbox doesn't open in time, or
 *   `harness-start-failed` when the host has no such harness, or it fails or sends nothing
 *   before its first event is due
 * @throws `stop.reason` when `stop` is told to stop
 * @throws SandboxNotReadyError when the sandbox check fails, before anything starts
 * @throws when the run doesn't take an approval it asks for, or it ends without a result
 */
export async function runHarnessCall(
  options: HarnessRunsOptions,
  call: HarnessCall,
  log: HarnessEventLog,
  approvals: HarnessApprovals,
  limits: StartLimits,
  stop: StopSignal,
): Promise<unknown> {
  const { effect } = call;
  const harness = options.harnesses[effect.harness];
  if (harness === undefined) {
    throw new RunFailureError(
      "harness-start-failed",
      `Halonic can't start ${effect.harness} on this computer: the host offers no such harness.`,
    );
  }
  const agent: HarnessAgent = {
    runId: call.runId,
    hubId: call.hubId,
    agentId: effect.agent,
    filesFolder: call.filesFolder,
  };
  const placement = await options.placement.where(agent);
  const sandbox = options.sandboxes[placement.runsOn];
  const check = await sandbox.check();
  if (!check.ok) {
    throw new SandboxNotReadyError(check.reason, effect.agent);
  }
  const started: StartedCall = { options, call, harness, log, approvals, limits, stop };
  // The bridge's events (model and tool calls) carry no state.
  const recorder = { record: (event: RunEventBody) => log.append(event) };
  const bridge = await unlessStopped(stop, options.bridges.open(agent, recorder), (late) =>
    late.close(),
  );
  try {
    const session = await openSandbox(started, placement, sandbox, bridge);
    const blocked = new BlockedAccesses(
      log,
      { state: effect.state, agent: effect.agent },
      options.home,
    );
    const stopReports = session.onBlocked((block) => blocked.note(block));
    try {
      const timeoutMs = startTimeoutOf(options, "harness");
      await log.append({
        type: "harness.started",
        state: effect.state,
        agent: effect.agent,
        harness: harness.id,
        timeoutMs,
      });
      const task = {
        runId: call.runId,
        hubId: call.hubId,
        agentId: effect.agent,
        instructions: call.agent.instructions,
        prompt: effect.prompt,
        ...(call.agent.model === undefined ? {} : { model: call.agent.model }),
      };
      const run = harness.start(task, session, bridge);
      const events = run[Symbol.asyncIterator]();
      try {
        return await followRun(started, run, events, timeoutMs);
      } finally {
        await run.cancel();
        // Only after `cancel()`: the port then ends the stream, so a read
        // still waiting settles and `return()` doesn't wait behind it. A
        // harness written as a generator runs its own clean-up here.
        await events.return?.();
      }
    } finally {
      await session.close();
      stopReports();
      // The step ends here. When the engine stopped it, the run records nothing more.
      if (!stop.stopped) await blocked.writeTotals();
    }
  } finally {
    await bridge.close();
    await log.settled();
  }
}

/** What the steps of a harness call share once it knows its harness. */
interface StartedCall {
  readonly options: HarnessRunsOptions;
  readonly call: HarnessCall;
  readonly harness: Harness;
  readonly log: HarnessEventLog;
  readonly approvals: HarnessApprovals;
  readonly limits: StartLimits;
  readonly stop: StopSignal;
}

/** The limit of one start, from the host's options or the default. */
function startTimeoutOf(options: HarnessRunsOptions, phase: StartPhase): number {
  return options.startTimeoutsMs?.[phase] ?? defaultStartTimeoutsMs[phase];
}

/**
 * Builds the profile, logs `sandbox.started`, opens the sandbox within its
 * time limit and logs `sandbox.opened`, or `sandbox.off` when a person chose
 * this computer for the agent. A session that opens after the time was up is
 * closed as soon as it arrives.
 */
async function openSandbox(
  { options, call, harness, log, limits, stop }: StartedCall,
  placement: PlacementAnswer,
  sandbox: Sandbox,
  bridge: OpenHarnessBridge,
): Promise<SandboxSession> {
  stop.throwIfStopped();
  const { state, agent } = call.effect;
  const subject: HarnessAgent = {
    runId: call.runId,
    hubId: call.hubId,
    agentId: agent,
    filesFolder: call.filesFolder,
  };
  const { profile, deniedGroups } = await options.profiles.profileOf(subject, bridge);
  const env = addHarnessEnvironment(profile.env, harness.environment?.(bridge, profile) ?? {});
  const timeoutMs = startTimeoutOf(options, "sandbox");
  await log.append({ type: "sandbox.started", state, agent, timeoutMs });
  const open = () => unlessStopped(stop, sandbox.open({ ...profile, env }), (late) => late.close());
  let session: SandboxSession;
  try {
    session = await limits.within({
      phase: "sandbox",
      timeoutMs,
      start: open,
      timedOut: () => new Error(`It didn't open within ${seconds(timeoutMs)}.`),
      late: (lateSession) => lateSession.close(),
    });
  } catch (error) {
    stop.throwIfStopped();
    throw new RunFailureError(
      "sandbox-start-failed",
      `The sandbox for agent "${agent}" didn't open.`,
      { cause: error },
    );
  }
  try {
    await log.append(openedEvent(placement, session, sandbox, deniedGroups, options.home, call));
  } catch (error) {
    // The caller closes only a session it got back.
    await session.close();
    throw error;
  }
  return session;
}

/**
 * What the log records once the step's session is open: `sandbox.off` with
 * the person's choice on this computer, where nothing is fenced off, and
 * otherwise `sandbox.opened` with what the sandbox lets the step do.
 */
function openedEvent(
  placement: PlacementAnswer,
  session: SandboxSession,
  sandbox: Sandbox,
  deniedGroups: readonly DeniedPathGroup[],
  home: string | null,
  { effect: { state, agent } }: HarnessCall,
): RunEventBody {
  if (placement.runsOn === "this-computer") {
    return { type: "sandbox.off", state, agent, chosenAt: placement.chosenAt };
  }
  const view = sandboxOpenedView(session.profile, {
    strength: sandbox.capabilities().strength,
    home,
    deniedGroups,
  });
  return { type: "sandbox.opened", state, agent, sandbox: view };
}

/**
 * Writes what the harness reports until the agent's own `agent.finished`,
 * and gives back its output. An approval it asks for goes to the person,
 * and their answer back to the harness. A stream that fails, or sends
 * nothing, before its first event is due means the program didn't start.
 * The caller's `cancel()` ends a wait that the time limit or `stop` gave up on.
 *
 * The agent's own `agent.started` and `agent.finished` never reach the log:
 * `decide` writes both for the state, and the run reads a top-level one as
 * the state's call starting or ending. Written twice, the run would wait on
 * a call that no longer exists.
 */
async function followRun(
  started: StartedCall,
  run: HarnessRun,
  events: AsyncIterator<HarnessEvent>,
  timeoutMs: number,
): Promise<unknown> {
  const { harness, call, log, limits, stop } = started;
  let next: IteratorResult<HarnessEvent>;
  try {
    next = await limits.within({
      phase: "harness",
      timeoutMs,
      start: () => unlessStopped(stop, events.next()),
      timedOut: () => new Error(`It sent nothing within ${seconds(timeoutMs)}.`),
    });
  } catch (error) {
    stop.throwIfStopped();
    throw new RunFailureError("harness-start-failed", `${harness.name} didn't start.`, {
      cause: error,
    });
  }
  for (; !next.done; next = await unlessStopped(stop, events.next())) {
    const event = next.value;
    if (event.type === "agent.finished" && event.parent === undefined) {
      return event.output;
    }
    if (event.type === "agent.started" && event.parent === undefined) {
      continue;
    }
    if (event.type === "approval.requested") {
      await passOnApproval(started, run, event);
      continue;
    }
    await log.append(withState(event, call.effect.state));
  }
  throw new Error(`${harness.name} ended without the agent's result.`);
}

/**
 * Asks the person about the approval the harness asked for, and passes the
 * answer on. The run records the question itself, under a call id of its
 * own, and waits on no call until the answer comes. So the log is held for
 * the question: every event reported before it is stored first, and one the
 * bridge or the sandbox reports while the run waits is stored after the
 * answer, under the call that goes on. Written during the wait, it would
 * find the run waiting on no call, and fail the rest of the call.
 */
async function passOnApproval(
  { approvals, log, stop }: StartedCall,
  run: HarnessRun,
  { tool, args, callId }: Extract<HarnessEvent, { type: "approval.requested" }>,
): Promise<void> {
  const { approved, comment } = await log.whileHeld(() =>
    unlessStopped(stop, approvals.ask({ tool, args })),
  );
  await run.send({
    type: "approval",
    callId,
    approved,
    ...(comment === undefined ? {} : { comment }),
  });
}

/** A time limit as people read it, such as `30 s`. */
function seconds(timeoutMs: number): string {
  return `${timeoutMs / 1000} s`;
}

/** A harness event as the run log keeps it: with the workflow state, for the types that have one. */
function withState(event: HarnessEvent, state: string): RunEventBody {
  switch (event.type) {
    case "agent.started":
    case "agent.finished":
    case "approval.requested":
      return { ...event, state } as RunEventBody;
    default:
      return event;
  }
}
