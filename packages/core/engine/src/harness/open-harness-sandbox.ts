// Opens the sandbox of one harness call: the profile, the `sandbox.started`
// and `sandbox.opened` (or `sandbox.off`) events, and the time limit on the
// opening. Split from `run-harness-call.ts`, which starts the harness in it.

import {
  type DeniedPathGroup,
  type RunEventBody,
  type SandboxSignIn,
  sandboxOpenedView,
} from "@halonicjs/events";
import {
  addHarnessEnvironment,
  type BridgeProvider,
  type Harness,
  type HarnessTask,
  type Sandbox,
  type SandboxSession,
} from "@halonicjs/ports";
import type { StopSignal } from "@halonicjs/std";
import type { ProgramHarness } from "../kernel/decide-types.ts";
import { StartFailedError } from "../run/start-failed-error.ts";
import type {
  HarnessAgent,
  HarnessRunsOptions,
  HostedHarnessBridge,
  PlacementAnswer,
} from "./harness-host.ts";
import type { HarnessApprovals, HarnessCall, HarnessEventLog } from "./run-harness-call.ts";
import { sandboxWhyOf } from "./start-failure-causes.ts";
import {
  defaultStartTimeoutsMs,
  type StartLimits,
  type StartPhase,
  seconds,
} from "./start-limits.ts";
import type { StepLimits } from "./step-limits.ts";
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
  /** The engine's stop, or the budget's or a step limit's once one was reached. */
  readonly stop: StopSignal;
  /** The step's use against its agent's `harnessLimits`. */
  readonly stepLimits: StepLimits;
}

/** The limit of one start, from the host's options or the default. */
export function startTimeoutOf(options: HarnessRunsOptions, phase: StartPhase): number {
  return options.startTimeoutsMs?.[phase] ?? defaultStartTimeoutsMs[phase];
}

/**
 * Builds the profile, logs `sandbox.started`, opens the sandbox within its
 * time limit and logs `sandbox.opened`, or `sandbox.off` when a person chose
 * this computer for the agent. A session that opens after the time was up is
 * closed as soon as it arrives. `model` is the task's, so the harness's
 * environment can point its program's background models at it.
 */
export async function openSandbox(
  { options, call, agent: subject, harness, log, limits, stop }: StartedCall,
  placement: PlacementAnswer,
  sandbox: Sandbox,
  bridge: HostedHarnessBridge,
  instructionsFolder: string | null,
  model: Pick<HarnessTask, "model" | "modelForEveryCall">,
): Promise<SandboxSession> {
  stop.throwIfStopped();
  const { state, agent } = call.effect;
  const { profile, deniedGroups } = await options.profiles.profileOf(
    subject,
    bridge,
    instructionsFolder,
  );
  const env = addHarnessEnvironment(
    profile.env,
    harness.environment?.(bridge, profile, model) ?? {},
  );
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
    const signIn = signInOf(subject.harness, bridge);
    const shown = { deniedGroups, home: options.home, ...(signIn === undefined ? {} : { signIn }) };
    await log.append(openedEvent(placement, session, sandbox, shown, call));
  } catch (error) {
    // The caller closes only a session it got back.
    await session.close();
    throw error;
  }
  return session;
}

/** The provider whose model each harness's program calls through the bridge. */
const providerOfHarness: Readonly<Record<ProgramHarness, BridgeProvider>> = {
  "claude-code": "anthropic",
  codex: "openai",
};

/**
 * How the agent signs in to its harness's provider, as the bridge reaches
 * it: the person's own subscription, or a key Halonic keeps, named by the
 * provider file it comes from. `undefined` when the host doesn't say.
 */
function signInOf(harness: ProgramHarness, bridge: HostedHarnessBridge): SandboxSignIn | undefined {
  const provider = providerOfHarness[harness];
  const access = bridge.providers?.[provider];
  if (access === undefined) return undefined;
  if (access.kind === "sign-in") return { kind: "subscription", provider };
  return { kind: "key", provider: access.providerId ?? provider };
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
  shown: {
    deniedGroups: readonly DeniedPathGroup[];
    home: string | null;
    signIn?: SandboxSignIn;
  },
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
  const view = sandboxOpenedView(session.profile, { strength, ...shown });
  return { type: "sandbox.opened", state, agent, sandbox: view };
}
