// Carries out one `run-harness` effect: it finds where the agent runs, opens
// the run's bridge and sandbox, starts the harness in them and writes what
// the harness reports, and what its sandbox refused, to the run's log. It
// gives back the agent's result; `decide` writes the task's own
// `agent.finished` from it, as it does for a model's answer. When the
// harness asks for a person's OK, the call keeps running and waits for the
// answer. Whatever the harness started is stopped before it returns, and
// also when the engine stops it on the way.

import type { RunEventBody, RunVersion } from "@halonicjs/events";
import type { Agent } from "@halonicjs/format";
import {
  type BridgeRecorder,
  type Harness,
  type HarnessEvent,
  type HarnessRun,
  type HarnessTask,
  ModelCallError,
  RunFailureError,
  type Sandbox,
  type SandboxSession,
} from "@halonicjs/ports";
import { type StopSignal, StopSource } from "@halonicjs/std";
import { type CallBudget, noCallBudget } from "../budget/call-budget.ts";
import type { RunHarnessEffect } from "../kernel/decide-types.ts";
import { SandboxNotReadyError } from "../run/sandbox-not-ready-error.ts";
import { StartFailedError } from "../run/start-failed-error.ts";
import { BlockedAccesses } from "./blocked-accesses.ts";
import { bridgeRecorderOf } from "./bridge-recorder.ts";
import type {
  HarnessAgent,
  HarnessRunsOptions,
  OpenInstructions,
  PlacementAnswer,
} from "./harness-host.ts";
import { logHarnessStart } from "./log-harness-start.ts";
import { openSandbox, type StartedCall, startTimeoutOf } from "./open-harness-sandbox.ts";
import { harnessCauseOf } from "./start-failure-causes.ts";
import { type StartLimits, seconds } from "./start-limits.ts";
import { type HarnessLimitError, StepLimits } from "./step-limits.ts";
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
  /** The connector the tool comes from, when it comes from one. */
  readonly connector?: string;
  readonly args: unknown;
}

/** Where a harness call asks a person for an OK. */
export interface HarnessApprovals {
  /**
   * Records the question in the run, which then waits for the person, and
   * resolves with their answer. The harness call keeps running meanwhile.
   *
   * @param onRecorded - told the question's run call id once recorded, the id a decision names
   * @throws when the run doesn't take the question, or the engine stops the call before an answer comes
   */
  ask(question: HarnessQuestion, onRecorded?: (callId: string) => void): Promise<HarnessAnswer>;
}

/** One harness call: the effect `decide` asked for, the run it belongs to and the agent's file. */
export interface HarnessCall {
  readonly effect: Omit<RunHarnessEffect, "type">;
  readonly runId: string;
  readonly hubId: string;
  /** The agent's file as the run started with it. */
  readonly agent: Agent;
  /** The version of the workspace the run read, as {@link HarnessAgent.version} says. */
  readonly version: RunVersion | null;
  /** Where the agent writes workspace files, as {@link HarnessAgent.filesFolder} says. */
  readonly filesFolder: string | null;
  /** What the call's model calls keep to; a call without it has no budget. */
  readonly budget?: CallBudget;
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
 * Before each model call the bridge passes on, the call asks its `budget`.
 * Once the budget is reached, the bridge refuses that model call and the
 * call stops the harness run, as it does for `stop`, and throws.
 *
 * The agent's `harnessLimits` bound the step: its model calls and their
 * cost, counted as the bridge passes them on, and its running time, on a
 * timer through `limits` that doesn't count while the run waits for a
 * person. Once one is reached, the bridge refuses the next model call and
 * the call stops the harness run, as it does for the budget, and throws.
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
 * @throws {ModelCallError} `local-only` when the workspace is local only, before anything starts
 * @throws RunFailureError `sandbox-start-failed` when the sandbox doesn't open in time, or
 *   `harness-start-failed` when the host has no such harness, or it fails or sends nothing
 *   before its first event is due
 * @throws `stop.reason` when `stop` is told to stop
 * @throws BudgetReachedError when the budget refused a model call
 * @throws HarnessLimitError when the step reached one of its agent's `harnessLimits`
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
  if (options.localOnly === true) {
    throw new ModelCallError(
      "local-only",
      `Agent "${effect.agent}" runs in ${effect.harness}, which sends its work to its own cloud model, and the workspace is local only, so Halonic didn't start it.`,
    );
  }
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
    harness: effect.harness,
    file: call.agent,
    version: call.version,
    filesFolder: call.filesFolder,
  };
  const placement = await options.placement.where(agent);
  const sandbox = options.sandboxes[placement.runsOn];
  const check = await sandbox.check();
  if (!check.ok) {
    throw new SandboxNotReadyError(check.reason, effect.agent);
  }
  // What stops the call from here on: the engine, the budget once it refused a model call, or a step limit.
  const callStop = new StopSource();
  const stepLimits = new StepLimits(
    call.agent.harnessLimits,
    { agent: effect.agent, harness: harness.name },
    (error: HarnessLimitError) => callStop.stop(error),
  );
  const stopWithEngine = stop.onStop(() => {
    if (stop.reason !== undefined) callStop.stop(stop.reason);
  });
  try {
    const started: StartedCall = {
      options,
      call,
      agent,
      harness,
      log,
      approvals,
      limits,
      stop: callStop.signal,
      stepLimits,
    };
    const recorder = bridgeRecorderOf(log, call.budget ?? noCallBudget, callStop, stepLimits);
    return await runInBridge(started, placement, sandbox, recorder, stop);
  } finally {
    stopWithEngine();
  }
}

/**
 * The model the program is asked for (requirement `engine.harness-model-alias`):
 * the provider's model id for an alias the host knows, for every call of
 * the program, else the agent file's `model` as written. None when the
 * file names none.
 *
 * @throws what the host's `providerModelOf` throws
 */
async function programModelOf(
  options: HarnessRunsOptions,
  call: HarnessCall,
): Promise<Pick<HarnessTask, "model" | "modelForEveryCall">> {
  const written = call.agent.model;
  if (written === undefined) return {};
  const mapped = await options.models?.providerModelOf(call.hubId, written);
  return mapped === undefined ? { model: written } : { model: mapped, modelForEveryCall: true };
}

/**
 * Opens the call's bridge and sandbox, runs the harness in them, and closes
 * everything again, as {@link runHarnessCall} says.
 *
 * @param engineStop - the engine's own stop, without the budget's: only that one keeps the totals of blocked accesses out of the log
 */
async function runInBridge(
  started: StartedCall,
  placement: PlacementAnswer,
  sandbox: Sandbox,
  recorder: BridgeRecorder,
  engineStop: StopSignal,
): Promise<unknown> {
  const { options, call, agent, harness, log, stop } = started;
  const { effect } = call;
  const model = await programModelOf(options, call);
  const bridge = await unlessStopped(
    stop,
    options.bridges.open(agent, recorder, placement.runsOn),
    (late) => late.close(),
  );
  let instructions: OpenInstructions | null = null;
  try {
    instructions = await unlessStopped(
      stop,
      options.instructions?.open(agent) ?? Promise.resolve(null),
      async (late) => late?.release(),
    );
    const session = await openSandbox(
      started,
      placement,
      sandbox,
      bridge,
      instructions?.folder ?? null,
      model,
    );
    const blocked = new BlockedAccesses(
      log,
      { state: effect.state, agent: effect.agent },
      options.home,
    );
    const stopReports = session.onBlocked((block) => blocked.note(block));
    try {
      bridge.sessionOpened?.(session);
      const timeoutMs = startTimeoutOf(options, "harness");
      await logHarnessStart(
        started,
        instructions?.pin ?? null,
        timeoutMs,
        startTimeoutOf(options, "trust"),
      );
      const task = {
        runId: call.runId,
        hubId: call.hubId,
        agentId: effect.agent,
        instructions: call.agent.instructions,
        prompt: effect.prompt,
        ...(instructions === null ? {} : { instructionsFolder: instructions.folder }),
        ...model,
      };
      await started.stepLimits.startClock(started.limits);
      // From here the clock stops however the step ends, even when the harness fails to start.
      try {
        const run = harness.start(task, session, bridge);
        const events = run[Symbol.asyncIterator]();
        let result: { output: unknown } | undefined;
        let failure: unknown;
        try {
          result = { output: await followRun(started, session, run, events, timeoutMs) };
        } catch (error) {
          failure = error;
        }
        await started.stepLimits.stopClock();
        await stopRun(harness, run, events, result === undefined ? { error: failure } : undefined);
        if (result === undefined) throw failure;
        return result.output;
      } finally {
        await started.stepLimits.stopClock();
      }
    } finally {
      await session.close();
      stopReports();
      // The step ends here. When the engine stopped it, the run records nothing more.
      if (!engineStop.stopped) await blocked.writeTotals();
    }
  } finally {
    // After the session: the sandbox may still read the folder until it has closed.
    await instructions?.release();
    await bridge.close();
    await log.settled();
  }
}

/**
 * Stops the harness run and ends its event stream. The stream ends even when
 * `cancel()` rejects, so a harness written as a generator still runs its own
 * clean-up. A program that couldn't be stopped may still be running, so that
 * failure is what the step reports, in place of its own result or error;
 * `original` stays as its `cause`.
 *
 * @param original - the error the step was ending with, if it was ending with one
 * @throws Error when the run couldn't be stopped
 */
async function stopRun(
  harness: Harness,
  run: HarnessRun,
  events: AsyncIterator<HarnessEvent>,
  original: { error: unknown } | undefined,
): Promise<void> {
  let stopFailure: { error: unknown } | undefined;
  try {
    await run.cancel();
  } catch (error) {
    stopFailure = { error };
  }
  // Only after `cancel()`: the port then ends the stream, so a read
  // still waiting settles and `return()` doesn't wait behind it. A
  // harness written as a generator runs its own clean-up here.
  await events.return?.();
  if (stopFailure === undefined) return;
  const reason =
    stopFailure.error instanceof Error ? stopFailure.error.message : String(stopFailure.error);
  throw new Error(`${harness.name} couldn't be stopped, so it may still be running: ${reason}`, {
    cause: original === undefined ? stopFailure.error : original.error,
  });
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
  session: SandboxSession,
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
    const why = await harnessCauseOf(stop, harness, session);
    throw new StartFailedError("harness-start-failed", `${harness.name} didn't start.`, why, {
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
  { approvals, log, stop, stepLimits }: StartedCall,
  run: HarnessRun,
  { tool, args, callId }: Extract<HarnessEvent, { type: "approval.requested" }>,
): Promise<void> {
  // The person's time to answer isn't the step's running time.
  await stepLimits.pauseClock();
  const { approved, comment } = await log.whileHeld(() =>
    unlessStopped(stop, approvals.ask({ tool, args })),
  );
  await stepLimits.resumeClock();
  await run.send({
    type: "approval",
    callId,
    approved,
    ...(comment === undefined ? {} : { comment }),
  });
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
