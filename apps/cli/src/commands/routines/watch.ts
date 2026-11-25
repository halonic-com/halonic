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
//
// A routine whose own file has errors, or whose agent is in a harness, is
// left out with a ✕ line, and the others start (HAL-15372, HAL-15396). One
// whose saved changes aren't live yet gets the list's ! line, since the
// watch runs it as last committed (C715 #8).

import { workspaceRoutineScheduler } from "@halonicjs/app";
import type { RoutineScheduler } from "@halonicjs/app/routines";
import type { RoutineEngine } from "@halonicjs/engine";
import type { RunStore } from "@halonicjs/ports";
import { DEFAULT_TICK_POLICY, type PlacedRoutine, routineKey } from "@halonicjs/routines";
import { KindedError } from "@halonicjs/std";
import {
  filesOf,
  type LoadedFileOf,
  type LoadedWorkspace,
  loadWorkspace,
} from "@halonicjs/workspace";
import type { CommandContext, CommandInput, StoppedResult } from "../../command.ts";
import { type Phrase, plainText } from "../../messages/phrase.ts";
import { routinesMessages } from "../../messages/routines.ts";
import { runMessages } from "../../messages/run.ts";
import { printable } from "../../output/printable.ts";
import {
  type PlacedAgent,
  placedWarning,
  programAgentsOf,
  type SandboxGateRun,
} from "../../sandbox-gate.ts";
import { givenDir, type OpenWorkspaceDir, openWorkspaceDir } from "../../workspace-dir.ts";
import {
  checkEngineRuns,
  openWorkspaceEngine,
  type WorkspaceEngineTarget,
} from "../../workspace-engine.ts";
import { routinesWithProblemsOf } from "../../workspace-problems.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";
import type { RunSetup } from "../run/run.ts";
import { checkRoutinesTrust } from "../run/trust.ts";
import { computerTimeZone } from "./list.ts";
import { RoutinesThatCantStart, routinesNotLiveYet, withoutCantStart } from "./watch-cant-start.ts";
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
 * @throws WorkspaceFileProblemsError when a file other than a routine's has
 *   an error; nothing ran (exit 2)
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
  // The routines as the last tick listed them, for the names the lines give,
  // without those that can't start: their files have errors (HAL-15372), or
  // their agent is in a harness (HAL-15396). They never start, so the sandbox
  // isn't checked for them; the first tick prints their ✕ lines.
  let routines: readonly PlacedRoutine[] = withoutCantStart(
    workspace,
    await versions.routines.listLoaded(),
  );
  const first = versions.latestVersion();
  const trust = await checkRoutinesTrust(dir, first, setup.trust(), typedDir);
  const cantStart = new RoutinesThatCantStart(context, typedDir, () => loadWorkspace(dir.store));
  const listed = () => routines;
  const report = watchReport(context, () => setup.clock(), listed);
  const warnings = placedWarnings(context);
  // Set before the engine opens, so no tick starts a run from a version that wasn't checked.
  versions.checkWith(laterVersionChecks(setup, dir, typedDir, warnings));
  let scheduler: RoutineScheduler | undefined;
  let runStore: RunStore | undefined;
  const engine = await openWorkspaceEngine(context, setup, {
    holder: "routinesWatch",
    dir,
    workspace,
    integrations: first.integrations,
    versions,
    trust,
    runs: workflowsOf(routines),
    ending: runMessages.nothingRan(),
    ...stuckReports(context, listed, () => runStore),
    routines: (parts) => {
      runStore = parts.runs;
      scheduler = routineScheduler(parts, workspace, versions, dir.name, setup, async (read) => {
        routines = await cantStart.leaveOut(await versions.live(), read);
        return routines;
      });
      const built = scheduler;
      return {
        onTick: async () => report.tick(await built.tick()),
        dispose: () => built.dispose(),
      };
    },
  });
  try {
    warnings.print(engine.placed);
    // Straight away, so the times missed since the last watch start now, not a minute from now.
    // Before the watching line, so that line means the scheduler has caught up; its runs print after.
    if (scheduler !== undefined) report.tick(await scheduler.tick());
    const onAClock = routines.filter(({ routine }) => routine.enabled && isOnAClock(routine));
    const saved = await loadWorkspace(dir.store);
    const notLiveYet = routinesNotLiveYet(saved, await versions.live());
    if (notLiveYet > 0) {
      context.printAhead(routinesMessages.routinesNeverLive(notLiveYet).phrase);
    }
    for (const line of await changesNotLiveLines(saved, versions, routines, typedDir)) {
      context.printAhead(line);
    }
    const name = printable(workspaceNameOf(workspace, dir));
    // With every routine left out, the ✕ lines above say what to fix, and this one what happens then (C666 #2).
    context.printAhead(
      onAClock.length === 0 && cantStart.leftOut > 0
        ? routinesMessages.watchingUntilOneCanStart(name).phrase
        : routinesMessages.watching(onAClock.length, name).phrase,
    );
    // A webhook routine never starts here, so the watch says what does start it (HAL-14299).
    for (const { routine } of routines.filter(startsOnWebRequest)) {
      context.printAhead(routinesMessages.startsOnWebRequest(printable(routine.name)).phrase);
    }
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
 * One line for each routine the watch starts whose saved changes aren't live
 * yet, as `halonic routines` writes it under the list, so someone who only
 * runs the watch learns their edit isn't used yet (C715 #8). A routine that
 * is off doesn't run, and one left out has its ✕ line already.
 */
async function changesNotLiveLines(
  saved: LoadedWorkspace,
  versions: WatchedVersions,
  scheduled: readonly PlacedRoutine[],
  typedDir: string | undefined,
): Promise<Phrase[]> {
  const keys = new Set(scheduled.map(routineKey));
  const withErrors = new Set(routinesWithProblemsOf(saved).map((each) => each.key));
  const lines: Phrase[] = [];
  for (const file of await versions.routinesNotLive(saved)) {
    const key = routineKey({ hub: file.hub, routine: file.value });
    if (!file.value.enabled || !keys.has(key)) continue;
    // The name comes from the routine's file, so it is made printable (cli-output section 5).
    const name = printable(file.value.name);
    lines.push(
      withErrors.has(key)
        ? routinesMessages.changesNotLiveWithErrors(name, typedDir).phrase
        : routinesMessages.changesNotLive(name).phrase,
    );
  }
  return lines;
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
  warnings: PlacedWarnings,
): VersionChecks {
  const ending = runMessages.nothingRan();
  return {
    trust: async (version) => await checkRoutinesTrust(dir, version, setup.trust(), typedDir),
    harnessAgent: (agent) => refuseHarnessAgent(agent),
    sandbox: async (workspace, run) => {
      // The sandbox first, as `run` checks it, then the harness it can't start (HAL-5219).
      warnings.print(await checkEngineRuns(setup, { dir, workspace, runs: [run], ending }));
      refuseHarnessAgent(programAgentsOf(workspace, run)[0]);
    },
  };
}

/** Prints the ! line of each agent set to "On this computer", or on hold, once a watch. */
interface PlacedWarnings {
  print(agents: readonly PlacedAgent[]): void;
}

function placedWarnings(context: CommandContext): PlacedWarnings {
  const warned = new Set<string>();
  return {
    print(agents) {
      for (const agent of agents) {
        // By its place too: an agent confirmed again after its ! line on hold gets its new line.
        const key = `${agent.kind} ${agent.name}`;
        if (warned.has(key)) continue;
        warned.add(key);
        context.printAhead(placedWarning(agent));
      }
    },
  };
}

/**
 * The routine scheduler on the engine's parts, as `workspaceRoutineScheduler`
 * builds it, for this watch and `halonic serve`. `scheduled` gets the
 * routines each tick reads and returns those to schedule.
 */
export function routineScheduler(
  engine: RoutineEngine,
  workspace: LoadedWorkspace,
  versions: WatchedVersions,
  folderName: string,
  setup: RunSetup,
  scheduled: (routines: readonly PlacedRoutine[]) => Promise<readonly PlacedRoutine[]>,
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
    routines: async () => await scheduled(await live.list()),
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
 * workflow to check; the watch leaves it out when that agent is in a
 * harness (`RoutinesThatCantStart`), and the local engine starts no other
 * program for it.
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

/**
 * Throws the refusal for an agent in a harness; nothing when there is none.
 * A run from a version that moved an agent into a harness since the tick
 * read it gets this as its ✕ line's reason.
 *
 * @throws KindedError `unavailable` when `agent` is given
 */
function refuseHarnessAgent(agent: LoadedFileOf<"agent"> | undefined): void {
  if (agent === undefined) return;
  const name = printable(agent.value.name);
  const reason = routinesMessages.harnessNotAvailable(name, printable(agent.value.harness ?? ""));
  throw new KindedError("unavailable", plainText(reason.phrase), {
    fix: plainText(routinesMessages.harnessNotAvailableFix(name).phrase),
  });
}

function isOnAClock(routine: PlacedRoutine["routine"]): boolean {
  return "schedule" in routine.trigger || "every" in routine.trigger;
}

/** Whether the routine is on and a web request starts it, which only `halonic serve` receives. */
function startsOnWebRequest({ routine }: PlacedRoutine): boolean {
  return routine.enabled && "webhook" in routine.trigger;
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
