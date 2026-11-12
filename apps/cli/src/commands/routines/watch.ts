// `halonic routines watch`: starts the workspace's routines on time, in the
// foreground, until Ctrl C or SIGTERM (HAL-4844). A thin command over
// `workspaceRoutineScheduler`, the routine scheduler the Studio's engine
// uses too: this file checks trust, opens the local engine with the
// scheduler on its tick, and prints one line per routine run it starts.
//
// Runs that wait for a time move on while it watches: the engine's
// scheduler delivers their timers, and those missed while nothing ran as
// soon as it opens (docs/specs/workflow-semantics.md, "Timers").

import { placedRoutines, type RoutineScheduler, workspaceRoutineScheduler } from "@halonicjs/app";
import type { RunVersion } from "@halonicjs/events";
import type { RunStore } from "@halonicjs/ports";
import { DEFAULT_TICK_POLICY, type PlacedRoutine } from "@halonicjs/routines";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import type { CommandContext, CommandInput, StoppedResult } from "../../command.ts";
import type { RoutineEngine } from "../../local-engine-host.ts";
import { routinesMessages } from "../../messages/routines.ts";
import { runMessages } from "../../messages/run.ts";
import { printable } from "../../output/printable.ts";
import type { SandboxGateRun } from "../../sandbox-gate.ts";
import { unsandboxedWarning } from "../../sandbox-gate.ts";
import { givenDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { openWorkspaceEngine } from "../../workspace-engine.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";
import type { RunSetup } from "../run/run.ts";
import { checkRunTrust } from "../run/trust.ts";
import { computerTimeZone } from "./list.ts";
import { watchReport } from "./watch-report.ts";
import { reportGaveUp, reportStuck } from "./watch-stuck.ts";

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
  const report = watchReport(context, () => setup.clock(), routines);
  let scheduler: RoutineScheduler | undefined;
  let runStore: RunStore | undefined;
  const engine = await openWorkspaceEngine(context, setup, {
    dir,
    workspace,
    runs: workflowsOf(routines),
    ending: runMessages.nothingRan(),
    // A run that gets stuck is reported, and the other routines go on starting.
    onStuck: (stuck) => {
      void reportStuck(context, routines, runStore, stuck);
    },
    // After an hour the engine gives up on it, so each try no longer pays for a model call.
    onGaveUp: (gaveUp) => {
      void reportGaveUp(context, routines, runStore, gaveUp);
    },
    routines: (parts) => {
      runStore = parts.runs;
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
    // The saved files it froze then, not the newest commit (`app.run-records-its-version`).
    runVersion: async () => frozenVersion,
    policy: { ...DEFAULT_TICK_POLICY, timeZone },
  });
}

/**
 * The version every routine run of a watch reads: the saved files, loaded
 * once when the watch starts.
 */
const frozenVersion: RunVersion = { reads: "saved-files" };

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
