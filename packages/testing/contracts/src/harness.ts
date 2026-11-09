import {
  addHarnessEnvironment,
  type Harness,
  type HarnessBridge,
  type HarnessEvent,
  type HarnessRun,
  type HarnessTask,
  type SandboxProfile,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type FakeProgram, FakeSandboxSession, idleProgram } from "./fake-sandbox-session.ts";

/** Creates the harness under test. */
export type MakeHarness = () => Promise<Harness>;

/** What the adapter's test harness hands the {@link harnessContract}. */
export interface HarnessContractHarness {
  make: MakeHarness;
  /** The harness's program doing the task: it reports the agent's result and exits, as the real program does. */
  finishing: FakeProgram;
  /**
   * The harness's program failing with `message`, the way the real program
   * reports a failure. The suite puts the bridge token in `message`, to check
   * the harness keeps it out of the error.
   */
  failing(message: string): FakeProgram;
}

/** The agent every case runs. */
const task: HarnessTask = {
  runId: "run-contract",
  hubId: "acme",
  agentId: "writer",
  instructions: "Answer in one short sentence.",
  prompt: "Name a colour of the sea.",
};

/** The profile the engine opens, before the harness adds its variables. */
const engineProfile: SandboxProfile = {
  workingFolder: "/contract/work",
  tempFolder: "/contract/temp",
  settingsFolder: "/contract/settings",
  readOnlyPaths: [],
  deniedPaths: [],
  env: { PATH: "/contract/bin", HOME: "/contract/home" },
  network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 60_000,
};

/** A bridge with a new random token, so a token found in an event came from this case. */
function newBridge(): HarnessBridge {
  return { url: "http://127.0.0.1:4100", token: `contract-token-${crypto.randomUUID()}` };
}

/** Opens a fake session the way the engine opens a real one: with the harness's variables added. */
function openSession(
  harness: Harness,
  bridge: HarnessBridge,
  program: FakeProgram,
): FakeSandboxSession {
  const added = harness.environment?.(bridge, engineProfile) ?? {};
  const profile = { ...engineProfile, env: addHarnessEnvironment(engineProfile.env, added) };
  return new FakeSandboxSession({ profile, program });
}

/** How a stream ended: by itself, or with `error`. */
interface StreamEnd {
  events: HarnessEvent[];
  ended: "finished" | "error";
  error?: unknown;
}

/** Reads `run` to its end. */
async function readToEnd(run: HarnessRun): Promise<StreamEnd> {
  const events: HarnessEvent[] = [];
  try {
    for await (const event of run) events.push(event);
    return { events, ended: "finished" };
  } catch (error) {
    return { events, ended: "error", error };
  }
}

/** The task agent's own `agent.finished` events: the ones without a `parent`. */
function taskFinishes(events: HarnessEvent[]): HarnessEvent[] {
  return events.filter((event) => event.type === "agent.finished" && event.parent === undefined);
}

/** Everything an error shows: its message, its stack and its causes. */
function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause === undefined ? "" : `\n${errorText(error.cause)}`;
  return `${error.name}: ${error.message}\n${error.stack}${cause}`;
}

/** Checks the stream ended with an `Error`, and without the task agent's `agent.finished`. */
function expectEndedWithError(end: StreamEnd): void {
  expect(end.ended).toBe("error");
  expect(end.error).toBeInstanceOf(Error);
  expect(taskFinishes(end.events)).toEqual([]);
}

/** Checks the bridge token appears in no event and not in the error, if the stream ended with one. */
function expectNoToken(end: StreamEnd, token: string): void {
  expect(JSON.stringify(end.events)).not.toContain(token);
  expect(errorText(end.error)).not.toContain(token);
}

/**
 * The {@link Harness} contract (requirement `contracts.harness`): how a run's
 * stream ends when it finishes, fails, is cancelled or can't start, and that
 * the bridge token stays out of every event and error. The cases run the
 * harness against a {@link FakeSandboxSession}, with the programs the
 * adapter's tests give.
 */
export function harnessContract(name: string, harness: HarnessContractHarness): void {
  verifies("contracts.harness", () => {
    describe(`Harness contract: ${name}`, () => {
      it("ends a finished run with one agent.finished for the task's agent, and nothing after it", async () => {
        const subject = await harness.make();
        const bridge = newBridge();
        const session = openSession(subject, bridge, harness.finishing);
        const end = await readToEnd(subject.start(task, session, bridge));

        expect(end.ended).toBe("finished");
        const finishes = taskFinishes(end.events);
        expect(finishes).toHaveLength(1);
        expect(finishes[0]).toMatchObject({ agent: task.agentId });
        expect(end.events.at(-1)).toBe(finishes[0]);
        expectNoToken(end, bridge.token);
      });

      it("refuses an answer once the run has ended, and cancels it without an error", async () => {
        const subject = await harness.make();
        const bridge = newBridge();
        const run = subject.start(task, openSession(subject, bridge, harness.finishing), bridge);
        await readToEnd(run);

        await expect(run.send({ type: "answer", text: "One more, please." })).rejects.toThrow();
        await expect(run.cancel()).resolves.toBeUndefined();
      });

      it("ends a failed run with an error and no agent.finished, and keeps the token out of it", async () => {
        const subject = await harness.make();
        const bridge = newBridge();
        const program = harness.failing(`The provider refused the key ${bridge.token}`);
        const end = await readToEnd(
          subject.start(task, openSession(subject, bridge, program), bridge),
        );

        expectEndedWithError(end);
        expectNoToken(end, bridge.token);
      });

      it("has stopped every program when cancel resolves, and ends the stream with an error", async () => {
        const subject = await harness.make();
        const bridge = newBridge();
        const session = openSession(subject, bridge, idleProgram);
        const run = subject.start(task, session, bridge);
        const reading = readToEnd(run);
        await session.whenStarted();

        await run.cancel();
        expect(session.running).toBe(0);
        const end = await reading;
        expectEndedWithError(end);
        expectNoToken(end, bridge.token);
      });

      it("returns at once when its program can't start, and ends the stream with an error", async () => {
        const subject = await harness.make();
        const bridge = newBridge();
        const session = openSession(subject, bridge, harness.finishing);
        await session.close();

        const run = subject.start(task, session, bridge);
        const end = await readToEnd(run);
        expectEndedWithError(end);
        expectNoToken(end, bridge.token);
      });
    });
  });
}
