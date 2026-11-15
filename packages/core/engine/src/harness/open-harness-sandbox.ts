// Opens the sandbox of one harness call: the profile, the `sandbox.started`
// and `sandbox.opened` (or `sandbox.off`) events, and the time limit on the
// opening. Split from `run-harness-call.ts`, which starts the harness in it.

import { type DeniedPathGroup, type RunEventBody, sandboxOpenedView } from "@halonicjs/events";
import {
  addHarnessEnvironment,
  type Harness,
  type OpenHarnessBridge,
  type Sandbox,
  type SandboxSession,
} from "@halonicjs/ports";
import type { StopSignal } from "@halonicjs/std";
import { StartFailedError } from "../run/start-failed-error.ts";
import type { HarnessAgent, HarnessRunsOptions, PlacementAnswer } from "./harness-host.ts";
import type { HarnessApprovals, HarnessCall, HarnessEventLog } from "./run-harness-call.ts";
import { sandboxWhyOf } from "./start-failure-causes.ts";
import {
  defaultStartTimeoutsMs,
  type StartLimits,
  type StartPhase,
  seconds,
} from "./start-limits.ts";
import { unlessStopped } from "./unless-stopped.ts";

/** What the steps of a harness call share once it knows its harness. */
export interface StartedCall {
  readonly options: HarnessRunsOptions;
  readonly call: HarnessCall;
  /** The agent, as the host's placement, bridge and profile are asked about it. */
  readonly agent: HarnessAgent;
  readonly harness: Harness;
  readonly log: HarnessEventLog;
  readonly approvals: HarnessApprovals;
  readonly limits: StartLimits;
  /** The engine's stop, or the budget's once it refused a model call. */
  readonly stop: StopSignal;
}

/** The limit of one start, from the host's options or the default. */
export function startTimeoutOf(options: HarnessRunsOptions, phase: StartPhase): number {
  return options.startTimeoutsMs?.[phase] ?? defaultStartTimeoutsMs[phase];
}

/**
 * Builds the profile, logs `sandbox.started`, opens the sandbox within its
 * time limit and logs `sandbox.opened`, or `sandbox.off` when a person chose
 * this computer for the agent. A session that opens after the time was up is
 * closed as soon as it arrives.
 */
export async function openSandbox(
  { options, call, agent: subject, harness, log, limits, stop }: StartedCall,
  placement: PlacementAnswer,
  sandbox: Sandbox,
  bridge: OpenHarnessBridge,
  instructionsFolder: string | null,
): Promise<SandboxSession> {
  stop.throwIfStopped();
  const { state, agent } = call.effect;
  const { profile, deniedGroups } = await options.profiles.profileOf(
    subject,
    bridge,
    instructionsFolder,
  );
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
    throw new StartFailedError(
      "sandbox-start-failed",
      `The sandbox for agent "${agent}" didn't open.`,
      await sandboxWhyOf(stop, sandbox),
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
  const { strength } = sandbox.capabilities();
  // A host that gave the sandbox placement the launcher would run the agent
  // without a fence while the log says it is fenced.
  if (strength === "none") {
    throw new Error(`The sandbox for agent "${agent}" has no fence.`);
  }
  const view = sandboxOpenedView(session.profile, {
    strength,
    home,
    deniedGroups,
  });
  return { type: "sandbox.opened", state, agent, sandbox: view };
}
