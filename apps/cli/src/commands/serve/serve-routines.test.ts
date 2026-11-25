import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { RunHistory } from "@halonicjs/app";
import type { RoutineHealth } from "@halonicjs/app/routines";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runCli } from "../../run-cli.ts";
import { openGitHistory } from "../../run-workspace.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
  trustAcmeRuns,
  writeFiles,
} from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
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

/** Each git test's time, with git on a busy runner (HAL-5244). */
const gitTimeout = 60_000;

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
 * scheduler's first tick, which only records the time, has settled. With
 * `git`, the live version is the workspace's last commit.
 */
async function startServe(
  time: FakeTime,
  options: { io?: CapturedIo; git?: boolean } = {},
): Promise<string> {
  const setup = acmeRunsSetup(acmeRuns);
  const io = options.io ?? captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const command = serveCommandWith({
    ...setup,
    ...(options.git === true
      ? { history: async (root: string) => openGitHistory(root, { git: await testGit() }) }
      : {}),
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

/** Commits every file in the workspace folder as a new version. */
async function makeLive(message: string): Promise<void> {
  const runner = await GitRunner.create({ git: await testGit() });
  try {
    const vcs = new GitVcs(acmeRuns.acme, {
      runner,
      author: { name: "Test", email: "test@example.com" },
    });
    const entries = await readdir(acmeRuns.acme, { recursive: true, withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => relative(acmeRuns.acme, join(entry.parentPath, entry.name)))
      .map((path) => path.replaceAll("\\", "/"))
      .filter((path) => !path.startsWith(".git/"));
    if (!(await vcs.status()).isRepo) await vcs.init();
    await vcs.stage(files);
    await vcs.commit(message);
  } finally {
    await runner.close();
  }
}

/** Moves the time to `HH:MM:SS` of 10 Nov 2026 and waits for the scheduler's tick, which may start nothing. */
async function tickAt(time: FakeTime, address: string, at: string): Promise<void> {
  time.set(`2026-11-10T${at}.000Z`);
  const minute = `2026-11-10T${at.slice(0, 5)}`;
  await waitUntil(
    `the tick at ${at}`,
    async () => {
      wokenUp(time);
      return ((await healthOf(address)).lastTick ?? "") >= minute;
    },
    slow,
  );
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

  it("leaves out a routine that can't start, with the watch's ✕ line, and starts the others", async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/workflows/routines/check.routine.yaml": everyTenMinutes("support-reply"),
      "hubs/support/workflows/routines/gone.routine.yaml": everyTenMinutes("gone")
        .replace("id: check", "id: gone")
        .replace("name: Check", "name: Gone"),
    });
    const io = captureIo(acmeRuns.acme);
    const time = fakeTime(engineStart);
    await startServe(time, { io });

    await passTo(time, "14:10:05");

    expect((await listedRuns()).map((run) => run.trigger)).toEqual([
      expect.objectContaining({ routineId: "support/check" }),
    ]);
    expect(io.stdout).toContain("✕ Gone can't start until its file is fixed · halonic validate");
  }, 30_000);

  it("starts no routine run from a live version that changed since it was trusted", {
    timeout: gitTimeout,
  }, async () => {
    // Ollama makes this Acme reach more than the test model, so it needs trust.
    await writeFiles(acmeRuns.acme, {
      "providers/ollama.yaml": "id: ollama\ntype: ollama\nlocal: true\n",
      "hubs/support/workflows/routines/check.routine.yaml": everyTenMinutes("support-reply"),
    });
    await makeLive("First version");
    await trustAcmeRuns(acmeRuns);
    const time = fakeTime(engineStart);
    const address = await startServe(time, { git: true });
    await passTo(time, "14:10:05");

    // A second provider changes what the trust check covers, and nobody trusts it.
    await writeFiles(acmeRuns.acme, {
      "providers/ollama-two.yaml": "id: ollama-two\ntype: ollama\nlocal: true\n",
    });
    await makeLive("Add a second Ollama");
    await tickAt(time, address, "14:20:05");
    await tickAt(time, address, "14:30:05");

    expect((await listedRuns()).map((run) => run.trigger)).toEqual([
      expect.objectContaining({ at: "2026-11-10T14:10:00.000Z" }),
    ]);
  });
});
