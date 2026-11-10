// The one way a command opens the engine of a workspace on this computer
// (HAL-4025): `halonic run` and `halonic runs send` both start or move on a
// run, so both open the local engine here, with the same stuck-step watch
// and the same signal to follow the run with. The sandbox check before a
// run starts a program (`checkRunSandbox`, HAL-1709) is here too, so both
// commands get it from one place, and neither can open the engine without
// it (Liam, HAL-4349).

import type { HttpClient } from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { CommandContext } from "./command.ts";
import { type LocalEngine, type LocalEngineInput, openLocalEngine } from "./local-engine-host.ts";
import type { Message } from "./messages/define.ts";
import { checkRunSandbox, type SandboxGateRun, type UnsandboxedAgent } from "./sandbox-gate.ts";
import {
  nodeSandboxGateHost,
  type SandboxGateHost,
  sandboxGateMachine,
} from "./sandbox-gate-machine.ts";
import { retriedLine, stuckTimerWatch } from "./stuck-timers.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";

/** What opening a workspace's engine uses on this computer, so tests can fix it. */
export interface WorkspaceEngineSetup {
  /** What the model providers call their servers with. */
  readonly http: HttpClient;
  /** Where the profile folder is; this process's by default. */
  readonly profile?: ProfileEnvironment;
  /** The engine's clock and ids; the computer's own by default. */
  readonly engine?: Pick<LocalEngineInput, "clock" | "ids" | "setTimer">;
  /** The sandbox and the "On this computer" choices; this computer's, in `profile`, by default. */
  readonly sandboxGate?: () => SandboxGateHost;
}

/** The run the engine is opened for, which the sandbox is checked for first. */
export interface WorkspaceEngineRun extends SandboxGateRun {
  /** What line 1 of a refusal ends with: "Nothing ran." for `run`, "Nothing was sent." for `runs send`. */
  readonly ending: Message;
}

/** The workspace the engine is opened for, and the run it starts or moves on. */
export interface WorkspaceEngineTarget {
  readonly dir: OpenWorkspaceDir;
  /** The loaded workspace, checked and trusted by the command. */
  readonly workspace: LoadedWorkspace;
  readonly run: WorkspaceEngineRun;
}

/** A workspace's engine, open until {@link LocalEngine.close}, with the signal to follow its runs with. */
export interface WorkspaceEngine extends LocalEngine {
  /**
   * Aborted at Ctrl C or SIGTERM, or when a run's step keeps failing. Pass
   * it to `WorkflowRuns`, and wrap the follow in `followUntilStopped`.
   */
  readonly signal: AbortSignal;
  /** Aborted, with the step's last error as its reason, when a run's step keeps failing. */
  readonly stuck: AbortSignal;
  /** The run's agents set to "On this computer", for the ! lines before it starts. */
  readonly unsandboxed: readonly UnsandboxedAgent[];
}

/**
 * Checks the sandbox for the run, then opens the workspace's engine. The
 * command closes it in a `finally`. Trust is the command's to check first,
 * each in its own words. Each retry of a failing step shows with `--debug`.
 *
 * @throws SandboxRefusedError when an agent of the run needs the sandbox and
 *   it can't start here: no engine was opened, so nothing ran (exit 9)
 * @throws KindedError `conflict` when another engine is open on the workspace
 *
 * @example
 * const engine = await openWorkspaceEngine(context, setup, { dir, workspace, run });
 * try {
 *   return await followUntilStopped(engine, workspace, (signal) => workflowRuns.follow(runId, { signal }));
 * } finally {
 *   await engine.close();
 * }
 */
export async function openWorkspaceEngine(
  context: CommandContext,
  setup: WorkspaceEngineSetup,
  target: WorkspaceEngineTarget,
): Promise<WorkspaceEngine> {
  const host = setup.sandboxGate?.() ?? nodeSandboxGateHost(setup.profile);
  const unsandboxed = await checkRunSandbox(
    target.workspace,
    target.run,
    await sandboxGateMachine(host, target.dir.root),
    target.run.ending,
  );
  const stuck = stuckTimerWatch((failure) => context.debug(retriedLine(failure)));
  const engine = await openLocalEngine({
    workspace: target.workspace,
    workspaceRoot: target.dir.root,
    secrets: context.secrets,
    http: setup.http,
    // The scheduler retries a failed step; one that keeps failing stops the command with its error.
    reportError: stuck.report,
    ...(setup.profile === undefined ? {} : { environment: setup.profile }),
    ...setup.engine,
  });
  return {
    executor: engine.executor,
    runs: engine.runs,
    close: () => engine.close(),
    signal: AbortSignal.any([context.signal, stuck.signal]),
    stuck: stuck.signal,
    unsandboxed,
  };
}
