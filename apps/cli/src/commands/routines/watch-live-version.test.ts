import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { RunHistory } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type OpenWorkspaceHistory, openGitHistory } from "../../run-workspace.ts";
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
import { waitUntil } from "../../test/wait-until.test-helper.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import { routinesCommandWith } from "./command.ts";

/** Follow up, which moves on by itself `after` its wait starts. */
function followUp(after: string): string {
  return [
    "id: follow-up",
    "name: Follow up",
    "initial: wait",
    "states:",
    "  wait:",
    "    type: wait",
    "    description: Wait for an answer",
    "    on:",
    "      - to: done",
    "        event: no-answer",
    `        after: ${after}`,
    "  done:",
    "    type: final",
    "",
  ].join("\n");
}

const workflowFile = "hubs/support/workflows/follow-up.workflow.yaml";

/** Starts Follow up at the top of every hour. */
const hourly = [
  "id: hourly-follow-up",
  "name: Hourly follow-up",
  "trigger: { every: 1h }",
  "run: { workflow: follow-up }",
  "",
].join("\n");

/** The watch's waits, and each test's, with git on a busy runner (HAL-5244). */
const slowWatch = { timeout: 10_000 };
const gitWatchTimeout = 60_000;

let acmeRuns: AcmeRuns;
let runner: GitRunner;
let vcs: GitVcs;
let running: { signals: ReturnType<typeof fakeSignals>; watching: Promise<number> } | undefined;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("routines-watch-live");
  await writeFiles(acmeRuns.acme, {
    [workflowFile]: followUp("5m"),
    "hubs/support/workflows/routines/hourly-follow-up.routine.yaml": hourly,
  });
  runner = await GitRunner.create({ git: await testGit() });
  vcs = new GitVcs(acmeRuns.acme, { runner, author: { name: "Test", email: "test@example.com" } });
});

afterEach(async () => {
  if (running !== undefined) {
    running.signals.send("SIGINT");
    await running.watching.catch(() => undefined);
    running = undefined;
  }
  await runner.close();
  await removeAcmeRuns(acmeRuns);
});

/** The workspace's history through git itself, as the CLI opens it. */
const history: OpenWorkspaceHistory = async (root) =>
  openGitHistory(root, { git: await testGit() });

/** Opens no history: git can't start, as when it isn't installed. */
const noGit: OpenWorkspaceHistory = () =>
  Promise.reject(new Error("git wasn't found on the PATH."));

/** Commits every file in the workspace folder as a new version, and returns its commit. */
async function makeLive(message: string): Promise<string> {
  const entries = await readdir(acmeRuns.acme, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(acmeRuns.acme, join(entry.parentPath, entry.name)))
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => !path.startsWith(".git/"));
  if (!(await vcs.status()).isRepo) await vcs.init();
  await vcs.stage(files);
  return await vcs.commit(message);
}

function watchCommand(time: FakeTime, opener: OpenWorkspaceHistory) {
  const setup = acmeRunsSetup(acmeRuns);
  return routinesCommandWith({
    ...setup,
    history: opener,
    engine: { ...setup.engine, clock: time.clock, setTimer: time.setTimer },
  });
}

function startWatch(time: FakeTime, ...args: string[]) {
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const watching = runCli(["routines", "watch", ...args], io, [watchCommand(time, history)], {
    stop: { signals, exitNow: () => undefined },
  });
  running = { signals, watching };
  return { io, signals, watching };
}

/** Moves the clock to `iso` and waits for the watch's next line. */
async function nextLineAt(time: FakeTime, io: { stdout: string[] }, iso: string) {
  const before = io.stdout.length;
  time.set(iso);
  await waitUntil(() => wokenUp(time) && io.stdout.length > before, slowWatch);
  return io.stdout[before];
}

async function storedRuns() {
  const runs = await new RunHistory(
    await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile),
  ).listRuns();
  return runs.runs;
}

/** The `run.started` of the stored run due at `at`. */
async function runStartedAt(at: string): Promise<RunEvent | undefined> {
  const run = (await storedRuns()).find((each) => each.trigger?.at === at);
  const runs = await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile);
  return (await runs.events(run?.id ?? "")).find((event) => event.type === "run.started");
}

verifies("cli.commands.routines.watch", () => {
  it("starts the live version, not a saved change, and records its commit", {
    timeout: gitWatchTimeout,
  }, async () => {
    const commit = await makeLive("First version");
    // Saved, not live: a shorter wait, and a routine that was never made live.
    await writeFiles(acmeRuns.acme, {
      [workflowFile]: followUp("1m"),
      "hubs/support/workflows/routines/saved-only.routine.yaml": hourly
        .replace("hourly-follow-up", "saved-only")
        .replace("Hourly follow-up", "Saved only"),
    });
    const time = fakeTime(engineStart);
    const { io, signals, watching } = startWatch(time);
    await waitUntil(() => io.stdout.length === 1, slowWatch);
    expect(io.stdout).toEqual(["Watching 1 routine in acme. Stop with Ctrl C."]);

    const line = await nextLineAt(time, io, "2026-11-10T15:00:10.000Z");

    expect(line).toMatch(/^✓ Started Hourly follow-up · run \w{6} · due 15:00$/u);
    // The live version's 5 minutes, not the saved minute.
    expect(await storedRuns()).toEqual([
      expect.objectContaining({ nextTimer: "2026-11-10T15:05:10.000Z" }),
    ]);
    expect(await runStartedAt("2026-11-10T15:00:00.000Z")).toMatchObject({
      version: { reads: "live-version", commit },
    });
    signals.send("SIGINT");
    expect(await watching).toBe(130);
  });

  it("starts the next due run from a version made while it watches", {
    timeout: gitWatchTimeout,
  }, async () => {
    await makeLive("First version");
    const time = fakeTime(engineStart);
    const { io, signals, watching } = startWatch(time);
    await waitUntil(() => io.stdout.length === 1, slowWatch);
    await nextLineAt(time, io, "2026-11-10T15:00:10.000Z");

    await writeFiles(acmeRuns.acme, { [workflowFile]: followUp("10m") });
    const second = await makeLive("Wait longer");
    await nextLineAt(time, io, "2026-11-10T16:00:10.000Z");

    expect(await runStartedAt("2026-11-10T16:00:00.000Z")).toMatchObject({
      version: { reads: "live-version", commit: second },
    });
    const run = (await storedRuns()).find(
      (each) => each.trigger?.at === "2026-11-10T16:00:00.000Z",
    );
    expect(run?.nextTimer).toBe("2026-11-10T16:10:10.000Z");
    signals.send("SIGINT");
    expect(await watching).toBe(130);
  });

  it("starts no run from a newer version that isn't trusted, and keeps watching", {
    timeout: gitWatchTimeout,
  }, async () => {
    await makeLive("First version");
    const time = fakeTime(engineStart);
    const { io, signals, watching } = startWatch(time, "--debug");
    await waitUntil(() => io.stdout.length === 1, slowWatch);

    await writeFiles(acmeRuns.acme, {
      "providers/ollama.yaml": "id: ollama\ntype: ollama\nlocal: true\n",
    });
    await makeLive("Add Ollama");
    const line = await nextLineAt(time, io, "2026-11-10T15:00:10.000Z");

    expect(line).toBe("✕ Hourly follow-up didn't start · due 15:00 · see why with --debug");
    expect(io.stderr.join("\n")).toContain("isn't trusted on this computer yet");
    expect(await storedRuns()).toEqual([]);
    signals.send("SIGINT");
    expect(await watching).toBe(130);
  });

  it("starts no run from a newer version that turns local only on", {
    timeout: gitWatchTimeout,
  }, async () => {
    await makeLive("First version");
    const time = fakeTime(engineStart);
    const { io, signals, watching } = startWatch(time, "--debug");
    await waitUntil(() => io.stdout.length === 1, slowWatch);

    await writeFiles(acmeRuns.acme, {
      "workspace.yaml": "id: acme\nname: Acme\nprivacy:\n  localOnly: true\n",
    });
    await makeLive("Local only");
    const line = await nextLineAt(time, io, "2026-11-10T15:00:10.000Z");

    expect(line).toBe("✕ Hourly follow-up didn't start · due 15:00 · see why with --debug");
    expect(io.stderr.join("\n")).toContain(
      "This version of acme turns local only on or off, which a running watch can't change.",
    );
    signals.send("SIGINT");
    expect(await watching).toBe(130);
  });

  it("refuses to watch while nothing is live yet", { timeout: gitWatchTimeout }, async () => {
    await vcs.init();
    const io = captureIo(acmeRuns.acme);

    const code = await runCli(["routines", "watch"], io, [
      watchCommand(fakeTime(engineStart), history),
    ]);

    expect(code).toBe(exitCode.conflict);
    // Its own line, as `halonic run` refuses it.
    expect(io.stderr).toEqual([
      "✕ Nothing is live yet, so there is nothing to run. Nothing ran.",
      "  Make a first commit in git, then run again.",
    ]);
    expect(await storedRuns()).toEqual([]);
  });

  it("refuses to watch when git can't start", async () => {
    const io = captureIo(acmeRuns.acme);

    const code = await runCli(["routines", "watch"], io, [
      watchCommand(fakeTime(engineStart), noGit),
    ]);

    expect(code).toBe(exitCode.unavailable);
    expect(io.stderr).toContain(
      "✕ Couldn't watch the routines in acme: git can't start on this computer, so the live version can't be read. Nothing ran.",
    );
  });
});
