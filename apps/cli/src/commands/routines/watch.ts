// `halonic routines watch`: starts the workspace's routines on time, in the
// foreground, until Ctrl C or SIGTERM (HAL-4844). A thin command over
// `workspaceRoutineScheduler`, the routine scheduler the Studio's engine
// uses too: this file checks trust, opens the local engine with the
// scheduler on its tick, and prints one line per routine run it starts.
//
// Each routine run reads the live version at the time it is due, as the
// Studio's scheduler does, through `WatchedVersions`: a version made while
// it watches counts from the next tick, once it passes the checks the
// first one did (HAL-6084).
//
// Runs that wait for a time move on while it watches: the engine's
// scheduler delivers their timers, and those missed while nothing ran as
// soon as it opens (docs/specs/workflow-semantics.md, "Timers").

import { workspaceRoutineScheduler } from "@halonicjs/app";
import type { RoutineScheduler } from "@halonicjs/app/routines";
import type { RunStore } from "@halonicjs/ports";
import { DEFAULT_TICK_POLICY, type PlacedRoutine } from "@halonicjs/routines";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import type { CommandContext, CommandInput, StoppedResult } from "../../command.ts";
import type { RoutineEngine } from "../../local-engine-host.ts";
import { routinesMessages } from "../../messages/routines.ts";
import { runMessages } from "../../messages/run.ts";
import { printable } from "../../output/printable.ts";
import type { SandboxGateRun, UnsandboxedAgent } from "../../sandbox-gate.ts";
import { unsandboxedWarning } from "../../sandbox-gate.ts";
import { givenDir, type OpenWorkspaceDir, openWorkspaceDir } from "../../workspace-dir.ts";
import {
  checkEngineRuns,
  openWorkspaceEngine,
  type WorkspaceEngineTarget,
} from "../../workspace-engine.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";
import type { RunSetup } from "../run/run.ts";
import { checkRunTrust } from "../run/trust.ts";
import { computerTimeZone } from "./list.ts";
import { watchReport } from "./watch-report.ts";
import { reportGaveUp, reportStuck } from "./watch-stuck.ts";
import { type VersionChecks, WatchedVersions } from "./watch-versions.ts";

/**
 * Watches until Ctrl C or SIGTERM, then returns that it stopped: exit 130
 * or 143. Each tick's started runs are printed as they start.
 *
 * @throws NoWorkspaceError when the folder holds no workspace
 * @throws HistoryUnavailableError when the workspace has history but git
 *   can't start; nothing ran (exit 9)
 * @throws OwnLineError `conflict` when the workspace has history but nothing
 *   is live yet; nothing ran
 * @throws NotTrustedError when the workspace isn't trusted here and its
 *   runs could reach more than the test model; nothing ran (exit 3)
 * @throws SandboxRefusedError when a routine's agent needs the sandbox and it
 *   can't start here; nothing ran (exit 9)
 * @throws KindedError `conflict` when another engine is open on the workspace
 * @throws the tick's last error, when three ticks in a row fail
 */
export async function watchRoutines(
  input: CommandInput,
  context: CommandContext,
  setup: RunSetup,
): Promise<StoppedResult> {
  const dir = await openWorkspaceDir(input, context);
  const versions = await WatchedVersions.open(dir, setup.history);
  try {
    return await watchVersions(input, context, setup, dir, versions);
  } finally {
    // After the engine has closed: no run starts from a version any more.
    await versions.close();
  }
}

/** The watch over the workspace's versions, from the one it starts from on. */
async function watchVersions(
  input: CommandInput,
  context: CommandContext,
  setup: RunSetup,
  dir: OpenWorkspaceDir,
  versions: WatchedVersions,
): Promise<StoppedResult> {
  const workspace = versions.latest();
  const typedDir = givenDir(input, dir);
  const trust = await checkRunTrust(dir, workspace, setup.trust(), typedDir);
  // The routines as the last tick listed them, for the names the lines give.
  let routines: readonly PlacedRoutine[] = await versions.routines.listLoaded();
  const listed = () => routines;
  const report = watchReport(context, () => setup.clock(), listed);
  const warnings = unsandboxedWarnings(context);
  // Set before the engine opens, so no tick starts a run from a version that wasn't checked.
  versions.checkWith(laterVersionChecks(setup, dir, typedDir, warnings));
  let scheduler: RoutineScheduler | undefined;
  let runStore: RunStore | undefined;
  const engine = await openWorkspaceEngine(context, setup, {
    dir,
    workspace,
    versions,
    trust,
    runs: workflowsOf(routines),
    ending: runMessages.nothingRan(),
    ...stuckReports(context, listed, () => runStore),
    routines: (parts) => {
      runStore = parts.runs;
      scheduler = routineScheduler(parts, workspace, versions, dir.name, setup, (latest) => {
        routines = latest;
      });
      const built = scheduler;
      return {
        onTick: async () => report.tick(await built.tick()),
        dispose: () => built.dispose(),
      };
    },
  });
  try {
    warnings.print(engine.unsandboxed);
    // Straight away, so the times missed since the last watch start now, not a minute from now.
    // Before the watching line, so that line means the scheduler has caught up; its runs print after.
    if (scheduler !== undefined) report.tick(await scheduler.tick());
    const onAClock = routines.filter(({ routine }) => routine.enabled && isOnAClock(routine));
    context.printAhead(
      routinesMessages.watching(onAClock.length, printable(workspaceNameOf(workspace, dir))).phrase,
    );
    // The runs held so far: the catch-up tick's, and any a scheduled tick started while it ran.
    report.open();
    await stopped(engine.signal);
  } finally {
    await engine.close();
  }
  if (engine.stuck.aborted) {
    throw engine.stuck.reason;
  }
  return { stopped: true, json: { started: report.started } };
}

/**
 * The watch's reports of a stuck run: it is reported, and the other
 * routines go on starting. After an hour the engine gives up on it, so each
 * try no longer pays for a model call.
 */
function stuckReports(
  context: CommandContext,
  listed: () => readonly PlacedRoutine[],
  runStore: () => RunStore | undefined,
): Pick<WorkspaceEngineTarget, "onStuck" | "onGaveUp"> {
  return {
    onStuck: (stuck) => {
      void reportStuck(context, listed(), runStore(), stuck);
    },
    onGaveUp: (gaveUp) => {
      void reportGaveUp(context, listed(), runStore(), gaveUp);
    },
  };
}

/**
 * The checks a version made while the watch runs passes before a run starts
 * from it: the trust and sandbox checks the watch made on its first
 * version, for the one workflow the run starts. A version that fails starts
 * no run, and the watch prints that run's ✕ line and goes on. The trust
 * check's grant is what the run's connectors start with.
 */
function laterVersionChecks(
  setup: RunSetup,
  dir: OpenWorkspaceDir,
  typedDir: string | undefined,
  warnings: UnsandboxedWarnings,
): VersionChecks {
  const ending = runMessages.nothingRan();
  return {
    trust: async (workspace) => await checkRunTrust(dir, workspace, setup.trust(), typedDir),
    sandbox: async (workspace, run) => {
      warnings.print(await checkEngineRuns(setup, { dir, workspace, runs: [run], ending }));
    },
  };
}

/** Prints the ! line of each agent set to "On this computer", once a watch. */
interface UnsandboxedWarnings {
  print(agents: readonly UnsandboxedAgent[]): void;
}

function unsandboxedWarnings(context: CommandContext): UnsandboxedWarnings {
  const warned = new Set<string>();
  return {
    print(agents) {
      for (const agent of agents) {
        if (warned.has(agent.name)) continue;
        warned.add(agent.name);
        context.printAhead(unsandboxedWarning(agent));
      }
    },
  };
}

/** The routine scheduler on the engine's parts, as `workspaceRoutineScheduler` builds it. */
function routineScheduler(
  engine: RoutineEngine,
  workspace: LoadedWorkspace,
  versions: WatchedVersions,
  folderName: string,
  setup: RunSetup,
  onListed: (routines: readonly PlacedRoutine[]) => void,
): RoutineScheduler {
  const timeZone = setup.clock().timeZone ?? computerTimeZone();
  const live = versions.routines;
  return workspaceRoutineScheduler({
    workspaceId: workspaceIdOf(workspace, folderName),
    clock: engine.clock,
    coordination: engine.coordination,
    executor: engine.executor,
    runs: engine.runs,
    // Read again on every tick, as the Studio's scheduler reads them (`app.scheduler-live-routines`).
    routines: async () => {
      const routines = await live.list();
      onListed(routines);
      return routines;
    },
    targetUnavailable: (run) => live.targetUnavailable(run),
    // The live version when the routine is due (`app.runs-read-latest-version`); the engine
    // then starts the run with that version's definitions (`engine.run-records-its-version`).
    runVersion: () => live.runVersion(),
    policy: { ...DEFAULT_TICK_POLICY, timeZone },
  });
}

/**
 * The workflows the routines start, for the sandbox check: each enabled
 * routine's workflow in its hub, once. A routine that runs one agent has no
 * workflow to check; the local engine has no harnesses in 0.1, so such an
 * agent starts no program.
 */
function workflowsOf(routines: readonly PlacedRoutine[]): SandboxGateRun[] {
  const runs = new Map<string, SandboxGateRun>();
  for (const { hub, routine } of routines) {
    const hubId = routine.run.hub ?? hub;
    if (!routine.enabled || !("workflow" in routine.run) || hubId === null) continue;
    runs.set(`${hubId}/${routine.run.workflow}`, { hubId, workflowId: routine.run.workflow });
  }
  return [...runs.values()];
}

function isOnAClock(routine: PlacedRoutine["routine"]): boolean {
  return "schedule" in routine.trigger || "every" in routine.trigger;
}

/**
 * The workspace's id from `workspace.yaml`, which names it the same on
 * every computer, as the routine scheduler asks. A `workspace.yaml` that
 * doesn't parse has none; the folder's name stands in.
 */
function workspaceIdOf(workspace: LoadedWorkspace, folderName: string): string {
  return filesOf(workspace, "workspace")[0]?.value.id ?? folderName;
}

/** Resolves once `signal` is aborted: at Ctrl C or SIGTERM, or when three ticks or wake-ups in a row fail. */
function stopped(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}
