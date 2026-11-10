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
  type HarnessRun,
  type OpenHarnessBridge,
  RunFailureError,
  type Sandbox,
  type SandboxSession,
} from "@halonicjs/ports";
import type { RunHarnessEffect } from "../kernel/decide-types.ts";
import type { HarnessAgent, HarnessRunsOptions } from "./harness-host.ts";

/** How long the sandbox has to open, in milliseconds (HAL-189 plan decision 4). */
export const sandboxStartTimeoutMs = 30_000;

/** How long the harness has to send its first event, in milliseconds (HAL-189 plan decision 4). */
export const harnessStartTimeoutMs = 60_000;

/** Where a harness call writes its events: the run's log, one event after the other. */
export interface HarnessEventLog {
  /** @throws when the event can't be stored; the call stops there */
  append(event: RunEventBody): Promise<void>;
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
 *
 * @returns the `output` of the agent's own `agent.finished`
 * @throws RunFailureError `sandbox-start-failed` when the sandbox doesn't open, or
 *   `harness-start-failed` when the host has no such harness or it ends before its first event
 * @throws when the sandbox isn't ready, the harness asks for an approval, or it ends without a result
 */
export async function runHarnessCall(
  options: HarnessRunsOptions,
  call: HarnessCall,
  log: HarnessEventLog,
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
  // The bridge's events (model and tool calls) carry no state.
  const recorder = { record: (event: RunEventBody) => log.append(event) };
  const bridge = await options.bridges.open(agent, recorder);
  try {
    const session = await openSandbox(options, sandbox, harness, call, bridge, log);
    try {
      await log.append({
        type: "harness.started",
        state: effect.state,
        agent: effect.agent,
        harness: harness.id,
        timeoutMs: harnessStartTimeoutMs,
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
      try {
        return await followRun(run, harness, effect.state, log);
      } finally {
        await run.cancel();
      }
    } finally {
      await session.close();
    }
  } finally {
    await bridge.close();
  }
}

/** Builds the profile, logs `sandbox.started`, opens the sandbox and logs `sandbox.opened`. */
async function openSandbox(
  options: HarnessRunsOptions,
  sandbox: Sandbox,
  harness: Harness,
  call: HarnessCall,
  bridge: OpenHarnessBridge,
  log: HarnessEventLog,
): Promise<SandboxSession> {
  const { state, agent } = call.effect;
  const subject = { runId: call.runId, hubId: call.hubId, agentId: agent };
  const { profile, deniedGroups } = await options.profiles.profileOf(subject, bridge);
  const env = addHarnessEnvironment(profile.env, harness.environment?.(bridge, profile) ?? {});
  await log.append({ type: "sandbox.started", state, agent, timeoutMs: sandboxStartTimeoutMs });
  let session: SandboxSession;
  try {
    session = await sandbox.open({ ...profile, env });
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
 * and gives back its output. A stream that fails before its first event
 * means the program didn't start.
 *
 * The agent's own `agent.started` and `agent.finished` never reach the log:
 * `decide` writes both for the state, and the run reads a top-level one as
 * the state's call starting or ending. Written twice, the run would wait on
 * a call that no longer exists.
 */
async function followRun(
  run: HarnessRun,
  harness: Harness,
  state: string,
  log: HarnessEventLog,
): Promise<unknown> {
  let started = false;
  try {
    for await (const event of run) {
      started = true;
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
      await log.append(withState(event, state));
    }
  } catch (error) {
    if (started) throw error;
    throw new RunFailureError("harness-start-failed", `${harness.name} didn't start.`, {
      cause: error,
    });
  }
  throw new Error(`${harness.name} ended without the agent's result.`);
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
