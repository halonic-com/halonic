// The one way a command opens the engine of a workspace on this computer
// (HAL-4025): `halonic run` and `halonic runs send` both start or move on a
// run, and `halonic routines watch` starts the routines' runs, so all three
// open the local engine here, with the same stuck-step watch and the same
// signal to follow the runs with. The sandbox check before a
// run starts a program (`checkRunSandbox`, HAL-1709) is here too, so both
// commands get it from one place, and neither can open the engine without
// it (Liam, HAL-4349).

import { nodeProgramStarter } from "@halonicjs/adapter-mcp";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type { HttpClient, TrustGrant } from "@halonicjs/ports";
import { type ProfileEnvironment, profileFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { closeAfterStop, stoppedCloseLimitMs } from "./close-after-stop.ts";
import type { CommandContext } from "./command.ts";
import { cliConnectorFactories, nodeConnectorMachine } from "./connector-machine.ts";
import { checkHarnessOverride } from "./harness-override.ts";
import {
  type EngineErrorSource,
  type LocalEngine,
  type LocalEngineInput,
  openLocalEngine,
  type RoutineEngine,
  type RoutineTicks,
} from "./local-engine-host.ts";
import { computerIntegrationMachine, computerPluginMachine } from "./local-integration-machine.ts";
import type { LocalRunConnectorsInput } from "./local-run-connectors.ts";
import type { Message } from "./messages/define.ts";
import type { Phrase } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { openLocalIntegration } from "./open-local-integration.ts";
import { openPluginBackend } from "./open-plugin-backend.ts";
import { printable } from "./output/printable.ts";
import { checkRunSandbox, type SandboxGateRun, type UnsandboxedAgent } from "./sandbox-gate.ts";
import {
  nodeSandboxGateHost,
  type SandboxGateHost,
  sandboxGateMachine,
} from "./sandbox-gate-machine.ts";
import { privateJournalFolder } from "./sandbox-journals.ts";
import {
  type GaveUpRun,
  retriedLine,
  type StuckTimer,
  type StuckTimerWatch,
  stuckTimerWatch,
} from "./stuck-timers.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";
import type { WorkspaceVersions } from "./workspace-versions.ts";

/** What opening a workspace's engine uses on this computer, so tests can fix it. */
export interface WorkspaceEngineSetup {
  /** What the model providers call their servers with. */
  readonly http: HttpClient;
  /** Where the profile folder is; this process's by default. */
  readonly profile?: ProfileEnvironment;
  /**
   * The engine's clock and ids; the computer's own by default. `onWokeUp`
   * hears each wake-up once its deliveries have settled, so a test that
   * moves the clock can wait for them.
   */
  readonly engine?: Pick<LocalEngineInput, "clock" | "ids" | "setTimer" | "onWokeUp">;
  /** The sandbox and the "On this computer" choices; this computer's, in `profile`, by default. */
  readonly sandboxGate?: () => SandboxGateHost;
  /** How long a stopped command waits for the engine to close; {@link stoppedCloseLimitMs} by default. */
  readonly stoppedCloseLimitMs?: number;
  /**
   * What runs start their connectors with, given the grant from the
   * command's trust check: this computer's programs, `PATH` and network by
   * default.
   */
  readonly runConnectors?: (
    trust: TrustGrant | null,
    target: Pick<WorkspaceEngineTarget, "dir" | "workspace">,
  ) => LocalRunConnectorsInput;
}

/** The workspace the engine is opened for, and the runs it starts or moves on. */
export interface WorkspaceEngineTarget {
  readonly dir: OpenWorkspaceDir;
  /** The loaded workspace, checked and trusted by the command. */
  readonly workspace: LoadedWorkspace;
  /** For `routines watch`, whose runs read the live version at each start; see `LocalEngineInput.versions`. */
  readonly versions?: WorkspaceVersions;
  /**
   * The grant from the command's trust check (`checkRunTrust`), which the
   * runs' connectors start with: `null` when the runs reach only the test
   * model, so no connector program starts.
   */
  readonly trust: TrustGrant | null;
  /**
   * The runs the sandbox is checked for first: the one run of `run` and
   * `runs send`, or each workflow the routines of `routines watch` start.
   */
  readonly runs: readonly SandboxGateRun[];
  /** What line 1 of a refusal ends with: "Nothing ran." for `run`, "Nothing was sent." for `runs send`. */
  readonly ending: Message;
  /** The routine scheduler on the engine's tick, for `routines watch`; none for a single run. */
  readonly routines?: (engine: RoutineEngine) => RoutineTicks;
  /**
   * Hears a run whose step keeps failing, for `routines watch`, which
   * reports it and keeps watching. Left out, as for `run` and `runs send`,
   * such a run stops the command with the step's error.
   */
  readonly onStuck?: (stuck: StuckTimer) => void;
  /**
   * Hears, with `onStuck`, a run whose step kept failing for an hour: the
   * engine cancelled it, or, when that failed too, leaves its step untried
   * until it closes (HAL-5294).
   */
  readonly onGaveUp?: (gaveUp: GaveUpRun) => void;
}

/** What {@link checkEngineRuns} checks: the workspace and its runs, without the engine's own options. */
export type EngineRunsTarget = Pick<WorkspaceEngineTarget, "dir" | "workspace" | "runs" | "ending">;

/** A workspace's engine, open until {@link LocalEngine.close}, with the signal to follow its runs with. */
export interface WorkspaceEngine extends LocalEngine {
  /**
   * Aborted at Ctrl C or SIGTERM, or as {@link stuck} is. Pass it to
   * `WorkflowRuns`, and wrap the follow in `followUntilStopped`.
   */
  readonly signal: AbortSignal;
  /**
   * Aborted, with the last error as its reason, when a run's step keeps
   * failing, or three ticks or wake-ups in a row fail. With `onStuck`, a
   * step that keeps failing goes there instead and doesn't abort it.
   */
  readonly stuck: AbortSignal;
  /** The runs' agents set to "On this computer", each once, for the ! lines before they start. */
  readonly unsandboxed: readonly UnsandboxedAgent[];
}

/**
 * Checks the sandbox for the runs, then opens the workspace's engine. The
 * command closes it in a `finally`. Trust is the command's to check first,
 * each in its own words. Each retry of a failing step shows with `--debug`.
 *
 * @throws KindedError `invalid_input` when a run's harness would move an
 *   agent whose allowed sites or working folder no check read into a
 *   program (`checkHarnessOverride`): no engine was opened (exit 2)
 * @throws SandboxRefusedError when an agent of a run needs the sandbox and
 *   it can't start here: no engine was opened, so nothing ran (exit 9)
 * @throws KindedError `conflict` when another engine is open on the workspace
 *
 * @example
 * const engine = await openWorkspaceEngine(context, setup, { dir, workspace, runs: [run], ending });
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
  const unsandboxed = await checkEngineRuns(setup, target);
  let opened: LocalEngine | undefined;
  const { onStuck, onGaveUp = () => {} } = target;
  const stuck = stuckTimerWatch(
    (failure) => context.debug(retriedLine(failure)),
    onStuck === undefined
      ? undefined
      : {
          clock: setup.engine?.clock ?? systemClock,
          onStuck,
          cancel: async (runId) => {
            // A timer is delivered only once the engine is open, so this is for types' sake.
            if (opened === undefined) throw new Error("The engine is still starting.");
            await opened.executor.cancel(runId);
          },
          onGaveUp,
        },
  );
  const engine = await openLocalEngine({
    workspace: target.workspace,
    ...(target.versions === undefined ? {} : { versions: target.versions }),
    workspaceRoot: target.dir.root,
    runConnectors: (
      setup.runConnectors ?? ((trust) => computerRunConnectors(trust, target, setup.profile))
    )(target.trust, target),
    secrets: context.secrets,
    http: setup.http,
    // The scheduler retries a failed step; one that keeps failing stops the command with its
    // error, or goes to `onStuck`, and after an hour to `onGaveUp`. A failed clean-up is only
    // a `--debug` line (HAL-7171).
    reportError: engineErrorReporter(stuck, (line) => context.debug(line)),
    // A timer that worked starts over: only an hour of failures in a row gives up on its run.
    onTimerDone: (timer) => stuck.succeeded(timer),
    holdsTimer: (timer) => stuck.holds(timer),
    ...(setup.profile === undefined ? {} : { environment: setup.profile }),
    ...(target.routines === undefined ? {} : { routines: countedTicks(target.routines, stuck) }),
    ...setup.engine,
    // Only failed wake-ups in a row count, as for ticks (HAL-5164).
    onWokeUp: () => {
      stuck.succeeded("wake-up");
      setup.engine?.onWokeUp?.();
    },
  });
  opened = engine;
  const closeLimitMs = setup.stoppedCloseLimitMs ?? stoppedCloseLimitMs;
  return {
    executor: engine.executor,
    runs: engine.runs,
    clock: engine.clock,
    coordination: engine.coordination,
    programFolders: engine.programFolders,
    // Once Ctrl C, SIGTERM or a closed terminal stopped the command, a close that hangs is
    // given up after a while, so the lock is freed and the process ends (HAL-6677).
    close: () =>
      closeAfterStop(engine, context.signal, closeLimitMs, () =>
        context.debug(runMessages.closeAbandoned(closeLimitMs / 1000).phrase),
      ),
    abandon: () => engine.abandon(),
    signal: AbortSignal.any([context.signal, stuck.signal]),
    stuck: stuck.signal,
    unsandboxed,
  };
}

/**
 * The checks {@link openWorkspaceEngine} makes before it opens the engine:
 * each run's harness override, then the sandbox. `run` calls it on its own
 * for a run it refuses anyway, so the refusal comes after the same checks
 * without opening the engine.
 *
 * @returns the runs' agents set to "On this computer", each once
 * @throws KindedError `invalid_input` when a run's harness would move an
 *   agent whose allowed sites or working folder no check read into a program (exit 2)
 * @throws SandboxRefusedError when an agent of a run needs the sandbox and
 *   it can't start here (exit 9)
 */
export async function checkEngineRuns(
  setup: WorkspaceEngineSetup,
  target: EngineRunsTarget,
): Promise<UnsandboxedAgent[]> {
  const host = setup.sandboxGate?.() ?? nodeSandboxGateHost(setup.profile);
  const machine = await sandboxGateMachine(host, target.dir.root);
  const unsandboxed = new Map<string, UnsandboxedAgent>();
  for (const run of target.runs) {
    checkHarnessOverride(target.workspace, run, target.ending);
    for (const agent of await checkRunSandbox(target.workspace, run, machine, target.ending)) {
      unsandboxed.set(agent.name, agent);
    }
  }
  return [...unsandboxed.values()];
}

/**
 * This computer's connector programs, `PATH` and network, for
 * {@link WorkspaceEngineSetup.runConnectors}. A local integration starts in
 * the runner, behind the trust check and the start gate.
 */
function computerRunConnectors(
  trust: TrustGrant | null,
  target: Pick<WorkspaceEngineTarget, "dir" | "workspace">,
  environment: ProfileEnvironment = nodeProfileEnvironment(),
): LocalRunConnectorsInput {
  const profile = profileFolder(environment);
  const machine = nodeConnectorMachine(environment);
  const integrations = computerIntegrationMachine({ ...target, trust: machine, environment });
  const plugins = computerPluginMachine(integrations, { trust: machine, environment });
  return {
    trust,
    // Workspace programs start in a sandbox session where the sandbox works (D45).
    factories: cliConnectorFactories(
      nodeProgramStarter,
      process.env,
      {
        sandbox: new SrtSandbox(undefined, undefined, privateJournalFolder(profile)),
        deniedPaths: [profile.root],
      },
      openLocalIntegration(integrations),
      openPluginBackend(plugins),
    ),
    // The CLI connects no built-in Google connector yet, the only kind that reads sign-ins.
    context: { http: machine.http, tokens: machine.tokens },
    dispose: () => integrations.dispose(),
  };
}

/**
 * The engine's `reportError`: a failed step, wake-up, tick or lock renewal
 * goes to `stuck`, which counts it. A run's connectors that failed to close,
 * a leftover program copy that couldn't be swept, or what a harness run left that couldn't be cleaned up, goes to `debug`
 * instead: it is clean-up, nothing tries it again, and it must never stop the command,
 * however often it happens in a `routines watch` (Liam, HAL-7171).
 *
 * @example
 * const reportError = engineErrorReporter(stuck, (line) => context.debug(line));
 */
export function engineErrorReporter(
  // The engine's lock reports to the watch as the scheduler does, so a lock lost three times
  // in a row stops the command.
  stuck: { report(error: unknown, source: EngineErrorSource): void },
  debug: (line: Phrase) => void,
): (error: unknown, source: EngineErrorSource) => void {
  return (error, source) => {
    if (source === "run-connectors" || source === "program-copies" || source === "harness-host") {
      const reason = printable(error instanceof Error ? error.message : String(error));
      debug(runMessages.cleanUpFailed(source, reason).phrase);
      return;
    }
    stuck.report(error, source);
  };
}

/**
 * The routines' ticks, with each tick that worked starting the count of
 * tick failures again: only three failed ticks in a row stop a watch that
 * runs for days (Liam, HAL-5077).
 */
function countedTicks(
  routines: (engine: RoutineEngine) => RoutineTicks,
  stuck: StuckTimerWatch,
): (engine: RoutineEngine) => RoutineTicks {
  return (engine) => {
    const ticks = routines(engine);
    return {
      onTick: async (at) => {
        await ticks.onTick(at);
        stuck.succeeded("tick");
      },
      dispose: () => ticks.dispose(),
    };
  };
}
