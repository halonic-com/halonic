// The one way a command opens the engine of a workspace on this computer
// (HAL-4025): `halonic run` and `halonic runs send` both start or move on a
// run, and `halonic routines watch` starts the routines' runs, so all three
// open the local engine here, with the same stuck-step watch and the same
// signal to follow the runs with. The sandbox check before a
// run starts a program (`checkRunSandbox`, HAL-1709) is here too, so both
// commands get it from one place, and neither can open the engine without
// it (Liam, HAL-4349).

import type { HttpClient } from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { CommandContext } from "./command.ts";
import { checkHarnessOverride } from "./harness-override.ts";
import {
  type LocalEngine,
  type LocalEngineInput,
  openLocalEngine,
  type RoutineEngine,
  type RoutineTicks,
} from "./local-engine-host.ts";
import type { Message } from "./messages/define.ts";
import { checkRunSandbox, type SandboxGateRun, type UnsandboxedAgent } from "./sandbox-gate.ts";
import {
  nodeSandboxGateHost,
  type SandboxGateHost,
  sandboxGateMachine,
} from "./sandbox-gate-machine.ts";
import {
  type GaveUpRun,
  retriedLine,
  type StuckTimer,
  type StuckTimerWatch,
  stuckTimerWatch,
} from "./stuck-timers.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";

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
}

/** The workspace the engine is opened for, and the runs it starts or moves on. */
export interface WorkspaceEngineTarget {
  readonly dir: OpenWorkspaceDir;
  /** The loaded workspace, checked and trusted by the command. */
  readonly workspace: LoadedWorkspace;
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
  const host = setup.sandboxGate?.() ?? nodeSandboxGateHost(setup.profile);
  const machine = await sandboxGateMachine(host, target.dir.root);
  const unsandboxed = new Map<string, UnsandboxedAgent>();
  for (const run of target.runs) {
    checkHarnessOverride(target.workspace, run, target.ending);
    for (const agent of await checkRunSandbox(target.workspace, run, machine, target.ending)) {
      unsandboxed.set(agent.name, agent);
    }
  }
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
    workspaceRoot: target.dir.root,
    secrets: context.secrets,
    http: setup.http,
    // The scheduler retries a failed step; one that keeps failing stops the command with its
    // error, or goes to `onStuck`, and after an hour to `onGaveUp`.
    reportError: stuck.report,
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
  return {
    executor: engine.executor,
    runs: engine.runs,
    programFolders: engine.programFolders,
    close: () => engine.close(),
    signal: AbortSignal.any([context.signal, stuck.signal]),
    stuck: stuck.signal,
    unsandboxed: [...unsandboxed.values()],
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
