import { RunHistory } from "@halonicjs/app";
import type { RoutineHealth } from "@halonicjs/app/routines";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runCli } from "../../run-cli.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
  writeFiles,
} from "../../test/acme-runs.ts";
import { captureIo } from "../../test/capture-io.ts";
import { fakeSignals } from "../../test/fake-signals.ts";
import { type FakeTime, fakeTime, wokenUp } from "../../test/fake-time.ts";
import { engineStart } from "../../test/run-setup.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import { serveCommandWith } from "./command.ts";

/** Fails every run before any model is asked: its items are a text, not a list. */
const broken = [
  "id: broken",
  "name: Broken",
  "initial: each",
  "states:",
  "  each:",
  "    type: foreach",
  '    items: "{{input.topics}}"',
  "    as: topic",
  "    workflow: support-reply",
  "    on:",
  "      - to: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

/** A routine every 10 minutes that starts `workflow`, with the input `{ topics: Monday }`. */
function everyTenMinutes(workflow: string): string {
  const run = `run: { workflow: ${workflow}, input: { topics: Monday } }`;
  return ["id: check", "name: Check", "trigger: { every: 10m }", run, ""].join("\n");
}

/** The first start opens the engine and the listener from cold imports. */
const slow = { timeout: 10_000 };

let acmeRuns: AcmeRuns;

/** The server the test started, which `afterEach` stops if the test failed before it did. */
let running: { signals: ReturnType<typeof fakeSignals>; serving: Promise<number> } | undefined;

beforeEach(async () => {
  // This Acme reaches only the test model, so it needs no trust (HAL-12011).
  acmeRuns = await makeAcmeRuns("serve-routines");
});

afterEach(async () => {
  if (running !== undefined) {
    running.signals.send("SIGINT");
    await running.serving.catch(() => undefined);
    running = undefined;
  }
  await removeAcmeRuns(acmeRuns);
});

/**
 * Starts `halonic serve` on the fake time and gives its address once its
 * scheduler's first tick, which only records the time, has settled.
 */
async function startServe(time: FakeTime): Promise<string> {
  const setup = acmeRunsSetup(acmeRuns);
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const command = serveCommandWith({
    ...setup,
    studioFolder: null,
    engine: { ...setup.engine, clock: time.clock, setTimer: time.setTimer },
  });
  const serving = runCli(["serve", "--port", "0"], io, [command], {
    stop: { signals, exitNow: () => undefined },
  });
  running = { signals, serving };
  await waitUntil("the server to print its address", () => io.stdout.length >= 1, slow);
  const found = /(http:\/\/localhost:\d+)/u.exec(io.stdout[0] ?? "");
  if (found?.[1] === undefined) throw new Error(`No address in ${JSON.stringify(io.stdout)}.`);
  const address = found[1];
  // A tick comes a minute after the engine opened at 14:01.
  time.set("2026-11-10T14:02:00.000Z");
  await waitUntil(
    "the first tick",
    async () => {
      wokenUp(time);
      const health = await healthOf(address);
      return health.lastTick !== null;
    },
    slow,
  );
  return address;
}

/** The runs the run list shows, oldest first. */
async function listedRuns() {
  const store = await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile);
  const { runs } = await new RunHistory(store).listRuns();
  return [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Moves the time to each `HH:MM:SS` of 10 Nov 2026 and lets the scheduler's tick at that time settle. */
async function passTo(time: FakeTime, ...times: string[]): Promise<void> {
  for (const at of times) {
    time.set(`2026-11-10T${at}.000Z`);
    const before = (await listedRuns()).length;
    await waitUntil(
      `the tick at ${at}`,
      async () => {
        wokenUp(time);
        return (await listedRuns()).length > before;
      },
      slow,
    );
  }
}

/** The routines' health, as `GET /api/routines/health` answers it. */
async function healthOf(address: string): Promise<RoutineHealth> {
  return (await (await fetch(`${address}/api/routines/health`)).json()) as RoutineHealth;
}

async function setPaused(address: string, paused: boolean): Promise<Response> {
  return await fetch(`${address}/api/routines/pause`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paused }),
  });
}

verifies("server.routines", () => {
  it("starts a routine every 10 minutes as a normal run: 3 runs in 30 minutes", async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/workflows/routines/check.routine.yaml": everyTenMinutes("support-reply"),
    });
    const time = fakeTime(engineStart);
    await startServe(time);

    await passTo(time, "14:10:05", "14:20:05", "14:30:05");

    const runs = await listedRuns();
    expect(runs.map((run) => [run.status, run.trigger])).toEqual(
      ["14:10", "14:20", "14:30"].map((at) => [
        "completed",
        expect.objectContaining({ routineId: "support/check", at: `2026-11-10T${at}:00.000Z` }),
      ]),
    );
  }, 30_000);

  it("starts none while paused, catches none up after the resume, and says so in the health", async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/workflows/routines/check.routine.yaml": everyTenMinutes("support-reply"),
    });
    const time = fakeTime(engineStart);
    const address = await startServe(time);
    expect((await setPaused(address, true)).status).toBe(200);

    for (const at of ["14:10:05", "14:20:05", "14:30:05"]) {
      time.set(`2026-11-10T${at}.000Z`);
      await waitUntil(
        `the paused tick at ${at}`,
        async () => {
          wokenUp(time);
          const health = await healthOf(address);
          return health.paused === true && health.nextRoutineAt === null;
        },
        slow,
      );
    }
    expect(await listedRuns()).toEqual([]);

    expect((await setPaused(address, false)).status).toBe(200);
    await passTo(time, "14:40:05");
    expect((await listedRuns()).map((run) => run.trigger)).toEqual([
      expect.objectContaining({ at: "2026-11-10T14:40:00.000Z" }),
    ]);
  }, 30_000);

  it("lists a failing run as failed and still starts the next pass", async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/workflows/broken.workflow.yaml": broken,
      "hubs/support/workflows/routines/check.routine.yaml": everyTenMinutes("broken"),
    });
    const time = fakeTime(engineStart);
    await startServe(time);

    await passTo(time, "14:10:05", "14:20:05");

    expect((await listedRuns()).map((run) => run.status)).toEqual(["failed", "failed"]);
  }, 30_000);
});
