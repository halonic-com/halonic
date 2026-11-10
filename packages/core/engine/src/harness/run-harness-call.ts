// Carries out one `run-harness` effect: it finds where the agent runs, opens
// the run's bridge and sandbox, starts the harness in them and writes what
// the harness reports to the run's log. It gives back the agent's result;
// `decide` writes the task's own `agent.finished` from it, as it does for a
// model's answer. Whatever the harness started is stopped before it returns.

import { type RunEventBody, sandboxOpenedView } from "@halonicjs/events";
import type { Agent } from "@halonicjs/format";
import {
  addHarnessEnvironment,
  type Harness,
  type HarnessEvent,
  type OpenHarnessBridge,
  RunFailureError,
  type Sandbox,
  type SandboxSession,
} from "@halonicjs/ports";
import type { RunHarnessEffect } from "../kernel/decide-types.ts";
import type { HarnessAgent, HarnessRunsOptions } from "./harness-host.ts";
import { defaultStartTimeoutsMs, type StartLimits, type StartPhase } from "./start-limits.ts";

/** Where a harness call writes its events: the run's log, one event after the other. */
export interface HarnessEventLog {
  /** @throws when the event can't be stored; the call stops there */
  append(event: RunEventBody): Promise<void>;
  /** Resolves once every append given so far has been stored or has failed. */
  settled(): Promise<void>;
}

/** One harness call: the effect `decide` asked for, the run it belongs to and the agent's file. */
export interface HarnessCall {
  readonly effect: Omit<RunHarnessEffect, "type">;
  readonly runId: string;
  readonly hubId: string;
  /** The agent's file as the run started with it. */
  readonly agent: Agent;
}

/**
 * Runs the agent of one harness call to its result.
 *
 * It never runs a harness without its sandbox: when the sandbox for the
 * agent's placement isn't ready, the call fails before anything starts.
 * Neither start waits for ever: `limits` ends the sandbox's opening and the
 * wait for the harness's first event when their time is up.
 *
 * It returns, or throws, only once the harness run, the session and the
 * bridge have stopped, in that order, and every event they reported is in
 * the log.
 *
 * @returns the `output` of the agent's own `agent.finished`
 * @throws RunFailureError `sandbox-start-failed` when the sandbox doesn't open in time, or
 *   `harness-start-failed` when the host has no such harness, or it fails or sends nothing
 *   before its first event is due
 * @throws when the sandbox isn't ready, the harness asks for an approval, or it ends without a result
 */
export async function runHarnessCall(
  options: HarnessRunsOptions,
  call: HarnessCall,
  log: HarnessEventLog,
  limits: StartLimits,
): Promise<unknown> {
  const { effect } = call;
  const harness = options.harnesses[effect.harness];
  if (harness === undefined) {
    throw new RunFailureError(
      "harness-start-failed",
      `Halonic can't start ${effect.harness} on this computer: the host offers no such harness.`,
    );
  }
  const agent: HarnessAgent = { runId: call.runId, hubId: call.hubId, agentId: effect.agent };
  const sandbox = options.sandboxes[await options.placement.where(agent)];
  const check = await sandbox.check();
  if (!check.ok) {
    throw new Error(
      `The sandbox isn't ready (${check.reason}), so agent "${effect.agent}" didn't start. Halonic never runs it without one.`,
    );
  }
  const started: StartedCall = { options, call, harness, log, limits };
  // The bridge's events (model and tool calls) carry no state.
  const recorder = { record: (event: RunEventBody) => log.append(event) };
  const bridge = await options.bridges.open(agent, recorder);
  try {
    const session = await openSandbox(started, sandbox, bridge);
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
        return await followRun(started, events, timeoutMs);
      } finally {
        await run.cancel();
        // Only after `cancel()`: the port then ends the stream, so a read
        // still waiting settles and `return()` doesn't wait behind it. A
        // harness written as a generator runs its own clean-up here.
        await events.return?.();
      }
    } finally {
      await session.close();
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
  readonly limits: StartLimits;
}

/** The limit of one start, from the host's options or the default. */
function startTimeoutOf(options: HarnessRunsOptions, phase: StartPhase): number {
  return options.startTimeoutsMs?.[phase] ?? defaultStartTimeoutsMs[phase];
}

/**
 * Builds the profile, logs `sandbox.started`, opens the sandbox within its
 * time limit and logs `sandbox.opened`. A session that opens after the time
 * was up is closed as soon as it arrives.
 */
async function openSandbox(
  { options, call, harness, log, limits }: StartedCall,
  sandbox: Sandbox,
  bridge: OpenHarnessBridge,
): Promise<SandboxSession> {
  const { state, agent } = call.effect;
  const subject = { runId: call.runId, hubId: call.hubId, agentId: agent };
  const { profile, deniedGroups } = await options.profiles.profileOf(subject, bridge);
  const env = addHarnessEnvironment(profile.env, harness.environment?.(bridge, profile) ?? {});
  const timeoutMs = startTimeoutOf(options, "sandbox");
  await log.append({ type: "sandbox.started", state, agent, timeoutMs });
  let session: SandboxSession;
  try {
    session = await limits.within({
      phase: "sandbox",
      timeoutMs,
      start: () => sandbox.open({ ...profile, env }),
      timedOut: () => new Error(`It didn't open within ${seconds(timeoutMs)}.`),
      late: (lateSession) => lateSession.close(),
    });
  } catch (error) {
    throw new RunFailureError(
      "sandbox-start-failed",
      `The sandbox for agent "${agent}" didn't open.`,
      { cause: error },
    );
  }
  try {
    const view = sandboxOpenedView(session.profile, {
      strength: sandbox.capabilities().strength,
      home: options.home,
      deniedGroups,
    });
    await log.append({ type: "sandbox.opened", state, agent, sandbox: view });
  } catch (error) {
    // The caller closes only a session it got back.
    await session.close();
    throw error;
  }
  return session;
}

/**
 * Writes what the harness reports until the agent's own `agent.finished`,
 * and gives back its output. A stream that fails, or sends nothing, before
 * its first event is due means the program didn't start; the caller's
 * `cancel()` then ends the wait for it.
 *
 * The agent's own `agent.started` and `agent.finished` never reach the log:
 * `decide` writes both for the state, and the run reads a top-level one as
 * the state's call starting or ending. Written twice, the run would wait on
 * a call that no longer exists.
 */
async function followRun(
  { harness, call, log, limits }: StartedCall,
  events: AsyncIterator<HarnessEvent>,
  timeoutMs: number,
): Promise<unknown> {
  let next: IteratorResult<HarnessEvent>;
  try {
    next = await limits.within({
      phase: "harness",
      timeoutMs,
      start: () => events.next(),
      timedOut: () => new Error(`It sent nothing within ${seconds(timeoutMs)}.`),
    });
  } catch (error) {
    throw new RunFailureError("harness-start-failed", `${harness.name} didn't start.`, {
      cause: error,
    });
  }
  for (; !next.done; next = await events.next()) {
    const event = next.value;
    if (event.type === "agent.finished" && event.parent === undefined) {
      return event.output;
    }
    if (event.type === "agent.started" && event.parent === undefined) {
      continue;
    }
    if (event.type === "approval.requested") {
      // The run's wait and `send` by call id come in the next step of stack 4.
      throw new Error(
        `${harness.name} asked for an approval, and harness runs can't wait for one yet.`,
      );
    }
    await log.append(withState(event, call.effect.state));
  }
  throw new Error(`${harness.name} ended without the agent's result.`);
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
