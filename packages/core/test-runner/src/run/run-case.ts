// One test case in an engine of its own: the case's run starts, gets the
// case's events and timers, and goes as far as it goes. What it did comes
// back for the expectations to check.

import { InputRefused, LocalExecutor } from "@halonicjs/engine";
import type { WorkflowTestCase } from "@halonicjs/format";
import type { IdGenerator, RunStore, Secrets } from "@halonicjs/ports";
import { parseDuration } from "@halonicjs/workflow";
import { filesOf, type LoadedWorkspace, runDefinitionsOf } from "@halonicjs/workspace";
import type { ScriptedModel, TestDeps } from "../test-deps.ts";
import type { TestFailure, TestRun } from "../test-result.ts";
import { ScriptedTools } from "./scripted-tools.ts";
import { TestClock, TestScheduler } from "./test-time.ts";

/** The id of each case's own run. Every case has an engine of its own, so they never clash. */
export const testRunId = "test_1";

/** What one case's runs did. */
export interface CaseRun {
  /** The case's own run, or `null` when the engine didn't start one. */
  readonly runId: string | null;
  /** The case's own run first, then its child runs. */
  readonly runs: readonly TestRun[];
  /** Why the runs couldn't go on as the case says: an event not taken, or an engine error. */
  readonly stopped: readonly TestFailure[];
  /** The script's own failures: unscripted tool calls, unused replies and results. */
  readonly script: readonly TestFailure[];
}

/** The case and where it runs. */
export interface CaseToRun {
  readonly workspace: LoadedWorkspace;
  readonly hub: string;
  readonly workflow: string;
  readonly testCase: WorkflowTestCase;
}

/**
 * Runs one case on a fresh engine: its own stores, its own test clock from
 * `deps.clock`'s time now, and a model and connectors that answer from the
 * case's script. No harness is passed, so a step that would start a program
 * fails the run with `harness-unavailable`, and nothing real is reached.
 */
export async function runCase(toRun: CaseToRun, deps: TestDeps): Promise<CaseRun> {
  const clock = new TestClock(deps.clock.now());
  const scheduler = new TestScheduler(clock);
  const stores = deps.stores();
  const model = deps.model(toRun.testCase.mocks);
  const tools = new ScriptedTools(toRun.testCase.tools);
  const executor = new LocalExecutor({
    resolveModel: async () => ({ provider: model.provider, model: "test", local: true }),
    halonicTools: deps.halonicTools ?? [],
    connectors: tools.clients(connectorsOf(toRun.workspace)),
    secrets: noSecrets,
    clock,
    runs: {
      store: stores.runs,
      blobs: stores.blobs,
      scheduler,
      ids: testIds(),
      definitionsOf: async (hubId, workflowId) =>
        runDefinitionsOf(toRun.workspace, hubId, workflowId),
      // Every call goes to a scripted connector, so sending is always allowed.
      connectorCalls: {
        location: toRun.workspace.location,
        sending: { checkSending: async () => ({ allowed: true }) },
        reportSettingsError: () => {},
      },
    },
  });
  scheduler.onTimer = (timer) => executor.onTimer(timer);

  let runId: string | null = null;
  const stopped: TestFailure[] = [];
  try {
    await executor.start({
      hubId: toRun.hub,
      workflowId: toRun.workflow,
      input: toRun.testCase.input,
      kind: "test",
      runId: testRunId,
    });
    runId = testRunId;
    await settle(scheduler);
    for (const event of toRun.testCase.events) {
      const failure = await deliver(event, { executor, scheduler, clock, runs: stores.runs });
      if (failure !== undefined) {
        stopped.push(failure);
        break;
      }
    }
  } catch (error) {
    stopped.push(engineError(error));
  }
  const runs = await closeAndRead(executor, stores.runs, runId, stopped);
  return { runId, runs, stopped, script: [...tools.failures(), ...unusedReplies(model)] };
}

/**
 * Closes the case's engine and reads its runs back. A late store or close
 * error fails this case too, into `stopped`, never the cases after it.
 */
async function closeAndRead(
  executor: LocalExecutor,
  store: RunStore,
  runId: string | null,
  stopped: TestFailure[],
): Promise<TestRun[]> {
  try {
    await executor.close();
  } catch (error) {
    stopped.push(engineError(error));
  }
  try {
    return runId === null ? [] : await runsFrom(store, runId);
  } catch (error) {
    stopped.push(engineError(error));
    return [];
  }
}

/** An engine error as a failure of the case. */
function engineError(error: unknown): TestFailure {
  return { kind: "error", message: error instanceof Error ? error.message : String(error) };
}

type TestEvent = WorkflowTestCase["events"][number];

interface Engine {
  readonly executor: LocalExecutor;
  readonly scheduler: TestScheduler;
  readonly clock: TestClock;
  readonly runs: RunStore;
}

/**
 * Moves the test clock on, or sends the event to the case's run when it
 * waits and takes it; then lets the runs go as far as they go.
 *
 * @returns the failure when the run didn't take the event
 */
async function deliver(event: TestEvent, engine: Engine): Promise<TestFailure | undefined> {
  if (typeof event === "object" && "advance" in event) {
    await advance(engine, parseDuration(event.advance));
    return undefined;
  }
  const [name, payload] =
    typeof event === "string" ? [event, undefined] : [event.event, event.payload];
  const run = await engine.runs.get(testRunId);
  const status = run?.status ?? "running";
  if (status !== "waiting") return { kind: "event-not-delivered", event: name, status };
  try {
    await engine.executor.send(testRunId, name, payload);
  } catch (error) {
    if (error instanceof InputRefused) return { kind: "event-not-delivered", event: name, status };
    throw error;
  }
  await settle(engine.scheduler);
  return undefined;
}

/**
 * Moves the test clock on by `ms`, stopping at each timer due on the way, so
 * every timer fires at its own time and one it sets counts from then, as in
 * real time.
 */
async function advance(engine: Engine, ms: number): Promise<void> {
  const target = engine.clock.now().getTime() + ms;
  for (
    let next = engine.scheduler.nextAt();
    next !== undefined && next <= target;
    next = engine.scheduler.nextAt()
  ) {
    engine.clock.advanceTo(next);
    await settle(engine.scheduler);
  }
  engine.clock.advanceTo(target);
  await settle(engine.scheduler);
}

/** Delivers every timer due now. A run that keeps setting due timers is an error, not a hang. */
async function settle(scheduler: TestScheduler): Promise<void> {
  if (!(await scheduler.runDue())) {
    throw new Error("The run kept setting timers that were due at once, so the test stopped it.");
  }
}

/** The run and every run it started, each after the run that started it, in the order they started. */
async function runsFrom(store: RunStore, runId: string): Promise<TestRun[]> {
  const summary = await store.get(runId);
  if (summary === null) return [];
  const events = await store.events(runId);
  const runs: TestRun[] = [{ id: runId, summary, events }];
  for (const event of events) {
    if (event.type === "workflow.started") runs.push(...(await runsFrom(store, event.childRunId)));
  }
  return runs;
}

/** The scripted replies left over, one failure per agent, in the order the script names them. */
function unusedReplies(model: ScriptedModel): TestFailure[] {
  return Object.entries(model.remaining())
    .filter(([, count]) => count > 0)
    .map(([agent, count]) => ({ kind: "unused-replies", agent, count }));
}

/** The workspace's connectors by id: each answers from the case's script. */
function connectorsOf(workspace: LoadedWorkspace) {
  return Object.fromEntries(
    filesOf(workspace, "connector").map((file) => [file.value.id, file.value]),
  );
}

/** Ids for whatever the engine names itself: a case's own run is always {@link testRunId}. */
function testIds(): IdGenerator {
  let count = 1;
  return {
    next: (prefix) => {
      count += 1;
      return `${prefix}_test_${count}`;
    },
  };
}

/** A test has no secrets: the scripted model needs no key. */
const noSecrets: Secrets = { get: async () => null };
