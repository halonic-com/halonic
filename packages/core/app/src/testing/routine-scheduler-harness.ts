import { EventBus } from "../event-bus.ts";
import { lastTickKey } from "../routine-ids.ts";
import type { RoutineOverlap } from "../routine-overlap.ts";
import {
  type DueFunction,
  RoutineScheduler,
  type RoutineStart,
  type ScheduledRun,
} from "../routine-scheduler.ts";
import type { AppEvents } from "../workspace-scope.ts";
import { TestCoordination } from "./memory-coordination.ts";
import { TestExecutor } from "./test-executor.ts";

/*
 * A `RoutineScheduler` over test routines, a fake clock, `TestCoordination`
 * and `TestExecutor`, shared by the scheduler's test files.
 */
/** A routine for these tests: due at a fixed minute of every hour, or of one hour a day. */
export interface TestRoutine {
  key: string;
  minute: number;
  hour?: number;
  agent?: string;
  /** Default "allow", so tests of other rules can start several runs of one routine. */
  overlap?: RoutineOverlap;
}

type Policy = "all" | "last";

/** A due run of a {@link TestRoutine}. */
type TestRun = ScheduledRun & { routine: TestRoutine };

const hourMs = 3_600_000;

/**
 * A stand-in for the tick function of `@halonicjs/routines`: every
 * due time in (lastTick, now], all of them or only the last. Nothing on the
 * first tick.
 */
const testDue: DueFunction<TestRoutine, Policy, TestRun> = (routines, lastTick, now, policy) => ({
  runs: testDueRuns(routines, lastTick, now, policy),
  skipped: [],
});

function testDueRuns(
  routines: readonly TestRoutine[],
  lastTick: Date | null,
  now: Date,
  policy: Policy,
): TestRun[] {
  if (lastTick === null) {
    return [];
  }
  const runs: TestRun[] = [];
  for (const routine of routines) {
    const times: Date[] = [];
    let at = Math.floor(lastTick.getTime() / hourMs) * hourMs + routine.minute * 60_000;
    for (; at <= now.getTime(); at += hourMs) {
      const hourMatches = routine.hour === undefined || new Date(at).getUTCHours() === routine.hour;
      if (at > lastTick.getTime() && hourMatches) {
        times.push(new Date(at));
      }
    }
    const picked = policy === "all" ? times : times.slice(-1);
    runs.push(
      ...picked.map((time) => ({
        key: routine.key,
        routine,
        at: time,
        trigger: "schedule" as const,
      })),
    );
  }
  return runs;
}

function startOf(run: TestRun): RoutineStart {
  const hubId = run.key.split("/")[0] ?? "";
  if (run.routine.agent !== undefined) {
    return { agent: { hubId, agentId: run.routine.agent, prompt: "Say hi" } };
  }
  return { workflow: { hubId, workflowId: "f", input: { q: `due ${run.at.toISOString()}` } } };
}

interface SetUpOptions {
  policy?: Policy;
  /** Another host of the same workspace. */
  shared?: { coordination: TestCoordination; executor: TestExecutor };
  startOf?: (run: TestRun) => RoutineStart;
  workspaceId?: string;
}

export const workspace = "ws-7f3a2c";
export const tickKey = lastTickKey(workspace);

export function setUp(
  routines: TestRoutine[],
  { policy = "all", shared, startOf: start = startOf, workspaceId = workspace }: SetUpOptions = {},
) {
  let now = Date.parse("2026-11-03T07:00:30Z");
  const coordination = shared?.coordination ?? new TestCoordination();
  const executor = shared?.executor ?? new TestExecutor();
  const events = new EventBus<AppEvents>();
  const ticks: AppEvents["routines.ticked"][] = [];
  events.on("routines.ticked", (tick) => ticks.push(tick));
  const scheduler = new RoutineScheduler<TestRoutine, Policy, TestRun>({
    workspaceId,
    clock: { now: () => new Date(now) },
    coordination,
    executor,
    routines: async () => routines,
    keyOf: (routine) => routine.key,
    due: testDue,
    policy,
    startOf: start,
    overlapOf: (run) => run.routine.overlap ?? "allow",
    runs: executor,
    events,
  });
  const at = (iso: string) => {
    now = Date.parse(iso);
  };
  return { scheduler, coordination, executor, ticks, at };
}

export const ids = (runs: { id: string }[]) => runs.map((run) => run.id);
