// `halonic routines watch`: starts the workspace's routines on time, in the
// foreground, until Ctrl C or SIGTERM (HAL-4844). A thin command over
// `workspaceRoutineScheduler`, the routine scheduler the Studio's engine
// uses too: this file checks trust, opens the local engine with the
// scheduler on its tick, and prints one line per routine run it starts.
//
// Runs that wait for a time move on while it watches: the engine's
// scheduler delivers their timers, and those missed while nothing ran as
// soon as it opens (docs/specs/workflow-semantics.md, "Timers").

import {
  placedRoutines,
  type RoutineScheduler,
  type RoutineTickResult,
  shortRunId,
  workspaceRoutineScheduler,
} from "@halonicjs/app";
import { DEFAULT_TICK_POLICY, type PlacedRoutine, routineKey } from "@halonicjs/routines";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import type { CommandContext, CommandInput, StoppedResult } from "../../command.ts";
import type { RoutineEngine } from "../../local-engine-host.ts";
import { routinesMessages } from "../../messages/routines.ts";
import { runMessages } from "../../messages/run.ts";
import { printable } from "../../output/printable.ts";
import { startedAt } from "../../run-times.ts";
import type { SandboxGateRun } from "../../sandbox-gate.ts";
import { unsandboxedWarning } from "../../sandbox-gate.ts";
import { givenDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { openWorkspaceEngine } from "../../workspace-engine.ts";
import type { RunSetup } from "../run/run.ts";
import { checkRunTrust } from "../run/trust.ts";
import { computerTimeZone } from "./list.ts";

/** A routine run the watch started, as `--json` gives it. */
interface StartedRoutineRun {
  readonly key: string;
  readonly runId: string;
  /** ISO time it was due. */
  readonly at: string;
}

/**
 * Watches until Ctrl C or SIGTERM, then returns that it stopped: exit 130
 * or 143. Each tick's started runs are printed as they start.
 *
 * @throws NoWorkspaceError when the folder holds no workspace
 * @throws NotTrustedError when the workspace isn't trusted here and its
 *   runs could reach more than the test model; nothing ran (exit 3)
 * @throws SandboxRefusedError when a routine's agent needs the sandbox and it
 *   can't start here; nothing ran (exit 9)
 * @throws KindedError `conflict` when another engine is open on the workspace
 * @throws the step's last error, when a run's step keeps failing
 * @throws the tick's last error, when three ticks in a row fail
 */
export async function watchRoutines(
  input: CommandInput,
  context: CommandContext,
  setup: RunSetup,
): Promise<StoppedResult> {
  const dir = await openWorkspaceDir(input, context);
  const workspace = await loadWorkspace(dir.store);
  await checkRunTrust(dir, workspace, setup.trust(), givenDir(input, dir));
  const routines = placedRoutines(workspace);
  const report = startReporter(context, setup, routines);
  let scheduler: RoutineScheduler | undefined;
  const engine = await openWorkspaceEngine(context, setup, {
    dir,
    workspace,
    runs: workflowsOf(routines),
    ending: runMessages.nothingRan(),
    routines: (parts) => {
      scheduler = routineScheduler(parts, workspace, routines, dir.name, setup);
      const built = scheduler;
      return {
        onTick: async () => report.tick(await built.tick()),
        dispose: () => built.dispose(),
      };
    },
  });
  try {
    for (const agent of engine.unsandboxed) context.printAhead(unsandboxedWarning(agent));
    // Straight away, so the times missed since the last watch start now, not a minute from now.
    // Before the watching line, so that line means the scheduler has caught up; its runs print after.
    const first = scheduler === undefined ? undefined : await scheduler.tick();
    const onAClock = routines.filter(({ routine }) => routine.enabled && isOnAClock(routine));
    context.printAhead(routinesMessages.watching(onAClock.length, printable(dir.name)).phrase);
    if (first !== undefined) report.tick(first);
    await stopped(engine.signal);
  } finally {
    await engine.close();
  }
  if (engine.stuck.aborted) {
    throw engine.stuck.reason;
  }
  return { stopped: true, json: { started: report.started } };
}

/** The routine scheduler on the engine's parts, as `workspaceRoutineScheduler` builds it. */
function routineScheduler(
  engine: RoutineEngine,
  workspace: LoadedWorkspace,
  routines: readonly PlacedRoutine[],
  folderName: string,
  setup: RunSetup,
): RoutineScheduler {
  const timeZone = setup.clock().timeZone ?? computerTimeZone();
  return workspaceRoutineScheduler({
    workspaceId: workspaceIdOf(workspace, folderName),
    clock: engine.clock,
    coordination: engine.coordination,
    executor: engine.executor,
    runs: engine.runs,
    // As the workspace was when the watch started: the engine runs those definitions too.
    routines: async () => routines,
    policy: { ...DEFAULT_TICK_POLICY, timeZone },
  });
}

/** Prints a line for each run a tick started or failed to start, and keeps the started ones for `--json`. */
function startReporter(
  context: CommandContext,
  setup: RunSetup,
  routines: readonly PlacedRoutine[],
): { tick(result: RoutineTickResult): void; readonly started: StartedRoutineRun[] } {
  const names = new Map(routines.map((placed) => [routineKey(placed), placed.routine.name]));
  const nameOf = (key: string) => printable(names.get(key) ?? key);
  const started: StartedRoutineRun[] = [];
  return {
    started,
    tick(result) {
      const clock = setup.clock();
      for (const run of result.started) {
        const key = run.trigger?.routineId ?? "";
        const at = run.trigger?.at ?? run.startedAt;
        started.push({ key, runId: run.id, at });
        context.printAhead(
          routinesMessages.started(nameOf(key), shortRunId(run.id), startedAt(new Date(at), clock))
            .phrase,
        );
      }
      for (const failure of result.failed) {
        context.printAhead(
          routinesMessages.notStarted(nameOf(failure.key), startedAt(new Date(failure.at), clock))
            .phrase,
        );
        context.debug(
          routinesMessages.notStartedWhy(printable(failure.key), printable(failure.error.message))
            .phrase,
        );
      }
    },
  };
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

/** Resolves once `signal` is aborted: at Ctrl C or SIGTERM, or when a run's step keeps failing. */
function stopped(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}
