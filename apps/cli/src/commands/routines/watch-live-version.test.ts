import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { FileAgentPlacementStore, FileTrustStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { AgentPlacement, RunHistory } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import type { SandboxCheck } from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
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
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { fakeSignals } from "../../test/fake-signals.ts";
import { type FakeTime, fakeTime, wokenUp } from "../../test/fake-time.ts";
import { engineStart } from "../../test/run-setup.ts";
import { waitUntil } from "../../test/wait-until.test-helper.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { openWorkspaceRuns, webCryptoDigest } from "../../workspace-runs.ts";
import { cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
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

/** Follow up with a first step by Writer, who runs in Claude Code and so needs the sandbox. */
const followUpByWriter = [
  "id: follow-up",
  "name: Follow up",
  "initial: draft",
  "states:",
  "  draft:",
  "    description: Draft a reminder",
  "    agent: writer",
  "    on:",
  "      - to: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

const writerInClaudeCode = "id: writer\nname: Writer\nharness: claude-code\n";

const sandboxStarts: SandboxCheck = { ok: true, reason: null, missing: [] };

const bubblewrapMissing: SandboxCheck = {
  ok: false,
  reason: "bubblewrap-missing",
  missing: ["bwrap was not found on PATH"],
};

/** Starts Follow up at the top of every hour. */
const hourly = [
  "id: hourly-follow-up",
  "name: Hourly follow-up",
  "trigger: { every: 1h }",
  "run: { workflow: follow-up }",
  "",
].join("\n");

/** Each test's time, with git on a busy runner (HAL-5244). */
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

/** The watch on `time`, whose sandbox check answers `sandbox`. */
function watchCommand(time: FakeTime, opener: OpenWorkspaceHistory, sandbox = sandboxStarts) {
  const setup = acmeRunsSetup(acmeRuns);
  const placement = new AgentPlacement({
    store: new FileAgentPlacementStore(join(acmeRuns.folder, "placements")),
    digest: webCryptoDigest,
    clock: fixedClock(engineStart),
  });
  return routinesCommandWith({
    ...setup,
    history: opener,
    engine: { ...setup.engine, clock: time.clock, setTimer: time.setTimer },
    sandboxGate: () => ({ sandbox: { check: async () => sandbox }, placement }),
  });
}

/** A watch started by {@link startWatch}: what it printed, and its exit code once it stops. */
interface StartedWatch {
  io: CapturedIo;
  watching: Promise<number>;
}

function startWatch(time: FakeTime, args: readonly string[] = [], sandbox = sandboxStarts) {
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const watching = runCli(
    ["routines", "watch", ...args],
    io,
    [watchCommand(time, history, sandbox)],
    {
      stop: { signals, exitNow: () => undefined },
    },
  );
  running = { signals, watching };
  return { io, signals, watching };
}

/**
 * Waits until `ready`, for as long as the test may take, and stops as soon
 * as the watch ends first. Its git reads take no fixed time: the watch
 * starts about 300 git processes before its first line, as each call checks
 * the repository again, and on a busy runner they took longer than a 10 s
 * wait (HAL-7548).
 *
 * @throws Error with the watch's exit code and errors when it ends before `ready`
 */
async function watchUntil(watch: StartedWatch, ready: () => boolean): Promise<void> {
  let ended: string | undefined;
  watch.watching.then(
    (code) => {
      ended = `with exit code ${code}`;
    },
    (error: unknown) => {
      ended = `by throwing ${String(error)}`;
    },
  );
  let passed = false;
  await waitUntil(
    () => {
      passed = ready();
      return passed || ended !== undefined;
    },
    { timeout: gitWatchTimeout },
  );
  if (!passed) {
    throw new Error(
      `The watch ended ${ended} before the check passed:\n${watch.io.stderr.join("\n")}`,
    );
  }
}

/** Waits for the watch's first line: the one that says it is watching. */
async function firstLine(watch: StartedWatch) {
  await watchUntil(watch, () => watch.io.stdout.length === 1);
}

/** Moves the clock to `iso` and waits for the watch's next line. */
async function nextLineAt(time: FakeTime, watch: StartedWatch, iso: string) {
  const { stdout } = watch.io;
  const before = stdout.length;
  time.set(iso);
  await watchUntil(watch, () => wokenUp(time) && stdout.length > before);
  return stdout[before];
}

async function storedRuns() {
  const runs = await new RunHistory(
    await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile),
  ).listRuns();
  return runs.runs;
}

/** Trusts Acme as it is now, in the trust store the watch reads. */
async function trustAcme(): Promise<void> {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acmeRuns.acme });
  const { subject } = await readWorkspaceTrust(dir, { path: undefined, endings: [] });
  const store = new FileTrustStore(join(acmeRuns.folder, "trust"));
  const trust = cliTrustService(store, fixedClock(engineStart));
  const check = await trust.check(subject);
  if (check.status === "refused") throw new Error("Acme has no connector to refuse.");
  expect((await trust.grant(subject, check.fingerprint, "cli")).ok).toBe(true);
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
    const watch = startWatch(time);
    const { io, signals, watching } = watch;
    await firstLine(watch);
    expect(io.stdout).toEqual(["Watching 1 routine in Acme. Stop with Ctrl C."]);

    const line = await nextLineAt(time, watch, "2026-11-10T15:00:10.000Z");

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
    const watch = startWatch(time);
    const { signals, watching } = watch;
    await firstLine(watch);
    await nextLineAt(time, watch, "2026-11-10T15:00:10.000Z");

    await writeFiles(acmeRuns.acme, { [workflowFile]: followUp("10m") });
    const second = await makeLive("Wait longer");
    await nextLineAt(time, watch, "2026-11-10T16:00:10.000Z");

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
    const watch = startWatch(time, ["--debug"]);
    const { io, signals, watching } = watch;
    await firstLine(watch);

    await writeFiles(acmeRuns.acme, {
      "providers/ollama.yaml": "id: ollama\ntype: ollama\nlocal: true\n",
    });
    await makeLive("Add Ollama");
    const line = await nextLineAt(time, watch, "2026-11-10T15:00:10.000Z");

    expect(line).toBe("✕ Hourly follow-up didn't start · due 15:00 · see why with --debug");
    expect(io.stderr.join("\n")).toContain("isn't trusted on this computer yet");
    expect(await storedRuns()).toEqual([]);
    signals.send("SIGINT");
    expect(await watching).toBe(130);
  });

  it("starts no run from a newer version whose agent needs a sandbox that can't start", {
    timeout: gitWatchTimeout,
  }, async () => {
    await makeLive("First version");
    const time = fakeTime(engineStart);
    const watch = startWatch(time, ["--debug"], bubblewrapMissing);
    const { io, signals, watching } = watch;
    await firstLine(watch);

    await writeFiles(acmeRuns.acme, {
      [workflowFile]: followUpByWriter,
      "hubs/support/agents/writer.agent.yaml": writerInClaudeCode,
    });
    await makeLive("Writer drafts in Claude Code");
    // Trusted as it is now, so only the sandbox check can stop the run.
    await trustAcme();
    const line = await nextLineAt(time, watch, "2026-11-10T15:00:10.000Z");

    expect(line).toBe("✕ Hourly follow-up didn't start · due 15:00 · see why with --debug");
    expect(io.stderr.join("\n")).toContain("the sandbox can't start on this computer");
    expect(await storedRuns()).toEqual([]);
    signals.send("SIGINT");
    expect(await watching).toBe(130);
  });

  it("starts no run from a newer version that turns local only on", {
    timeout: gitWatchTimeout,
  }, async () => {
    await makeLive("First version");
    const time = fakeTime(engineStart);
    const watch = startWatch(time, ["--debug"]);
    const { io, signals, watching } = watch;
    await firstLine(watch);

    await writeFiles(acmeRuns.acme, {
      "workspace.yaml": "id: acme\nname: Acme\nprivacy:\n  localOnly: true\n",
    });
    await makeLive("Local only");
    const line = await nextLineAt(time, watch, "2026-11-10T15:00:10.000Z");

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
