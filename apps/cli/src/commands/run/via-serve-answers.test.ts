// How `halonic run` takes each answer of a `serve` that holds the engine (HAL-19396): the engine
// is held as `serve` would hold it, and the console answers as the test says, so every answer and
// every refusal that stays is checked without starting `serve` itself.

import { cp, mkdtemp, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FileAgentPlacementStore,
  FileTrustStore,
  FolderDefinitionStore,
} from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import type { LocalEngine } from "@halonicjs/adapter-workspace-engine-node";
import { AgentPlacement, agentFingerprint } from "@halonicjs/app";
import { noKeyOrigins, type SandboxCheck } from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type EngineHolder, openLocalEngine } from "../../cli-local-engine.ts";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { openGitHistory } from "../../run-workspace.ts";
import { captureIo } from "../../test/capture-io.ts";
import { memoryConsole } from "../../test/memory-console.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { testRunSetup } from "../../test/run-setup.ts";
import { savedVersionOf } from "../../workspace-at-version.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "../../workspace-runs.ts";
import { assertTrustable, cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
import { type ConsoleTransport, consolePlace } from "../serve/serve-console.ts";
import { runCommandWith } from "./command.ts";
import type { RunSetup } from "./run.ts";

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const samsEmail = ["--input", "examples/refund-question.json"];
const writerPath = "hubs/support/agents/writer.agent.yaml";
const noCommands = { path: undefined, endings: [] };
const servedRunId = "run_mfx3k2a1_a1b2c3d4";
/** Git and the engine open from cold imports, which is slow on a busy runner. */
const slowTest = { timeout: 30_000 };

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
let transport: ConsoleTransport;
let asked: unknown[];
const opened: LocalEngine[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-serve-answers-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "profile") } };
  transport = memoryConsole();
  asked = [];
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(opened.splice(0).map((engine) => engine.close()));
  await removeTestFolder(folder);
});

/**
 * Holds Acme's engine as `holder` does, with a console that answers every request with `reply`, or
 * with what `reply` gives when it is a function.
 */
async function heldBy(
  holder: EngineHolder,
  reply: object | (() => Promise<object>) = { ok: true, runId: servedRunId },
) {
  const engine = await openLocalEngine({
    workspace: await loadWorkspace(new FolderDefinitionStore(acme, "./acme")),
    workspaceRoot: acme,
    trusted: true,
    secrets: { get: async () => null },
    keyOrigins: noKeyOrigins,
    http: { fetch: () => Promise.reject(new TypeError("The test model calls no server.")) },
    environment: profile,
    reportError: () => {},
    holder,
  });
  opened.push(engine);
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  await transport.listen(
    await consolePlace({ profile }, dir),
    async (request) => {
      asked.push(request);
      return typeof reply === "function" ? await reply() : reply;
    },
    () => {},
  );
}

async function run(args: string[], setup: Partial<RunSetup> = {}) {
  const io = captureIo(acme);
  const command = runCommandWith({
    ...testRunSetup(folder, profile),
    console: transport,
    ...setup,
  });
  const code = await runCli(["run", "support-reply", ...args], io, [command]);
  return { code, stdout: io.stdout, stderr: io.stderr.join("\n") };
}

/** Commits every file in Acme, then saves a change that isn't in that version. */
async function liveWithSavedChange(): Promise<GitRunner> {
  const runner = await GitRunner.create({ git: await testGit() });
  const vcs = new GitVcs(acme, { runner, author: { name: "Test", email: "test@example.com" } });
  const entries = await readdir(acme, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(acme, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
  await vcs.init();
  await vcs.stage(files);
  await vcs.commit("First version");
  const path = join(acme, "hubs/support/workflows/support-reply.workflow.yaml");
  const text = await readFile(path, "utf8");
  await writeFile(path, text.replace("name: Support reply", "name: Saved reply"));
  return runner;
}

/**
 * Writer in Claude Code, set to "On this computer", and Acme trusted as it is then: the run's
 * agent runs without the sandbox, which `run` says before it starts (`cli.run-sandbox-gate`).
 */
async function writerOnThisComputer(): Promise<Partial<RunSetup>> {
  const settings = join(acme, "workspace.yaml");
  const text = await readFile(settings, "utf8");
  await writeFile(settings, text.replace("localOnly: true", "localOnly: false"));
  const writer = join(acme, writerPath);
  await writeFile(writer, `${await readFile(writer, "utf8")}harness: claude-code\n`);
  const placement = new AgentPlacement({
    store: new FileAgentPlacementStore(join(folder, "placements")),
    digest: webCryptoDigest,
    clock: fixedClock(Date.UTC(2026, 10, 9, 10)),
  });
  const file = new Uint8Array(await readFile(writer));
  const subject = { location: await realpath(acme), hub: "support", agent: "writer", file };
  const shown = await agentFingerprint(file, webCryptoDigest);
  expect((await placement.chooseThisComputer(subject, shown)).ok).toBe(true);
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const read = await readWorkspaceTrust(dir, noCommands, await savedVersionOf(dir));
  const trust = cliTrustService(new FileTrustStore(join(folder, "trust")), fixedClock(0));
  const check = await trust.check(read.subject);
  assertTrustable(check, read);
  expect((await trust.grant(read.subject, check.fingerprint, "cli")).ok).toBe(true);
  // Never asked: an agent set to "On this computer" isn't fenced.
  const missing: SandboxCheck = { ok: false, reason: "bubblewrap-missing", missing: [] };
  const sandbox = { check: async () => missing };
  return { sandboxGate: () => ({ sandbox, placement }) };
}

verifies("cli.local-engine-lock", () => {
  it("says saved changes aren't live before the started line", slowTest, async () => {
    const runner = await liveWithSavedChange();
    try {
      await heldBy("serve");
      const history = async (root: string) => openGitHistory(root, { git: await testGit() });

      const { code, stdout } = await run(samsEmail, { history });

      expect(code).toBe(exitCode.ok);
      expect(stdout[0]).toBe("Your uncommitted changes aren't used. Commit them to run them.");
      expect(stdout[1]).toBe("✓ Started in the running Studio as run b2c3d4.");
    } finally {
      await runner.close();
    }
  });

  it("says an agent runs without the sandbox before the started line", slowTest, async () => {
    const setup = await writerOnThisComputer();
    await heldBy("serve");

    const { code, stdout } = await run(samsEmail, setup);

    expect(code).toBe(exitCode.ok);
    expect(stdout[0]).toMatch(/^! Writer runs on this computer without the sandbox/u);
    expect(stdout[1]).toMatch(/^✓ Started in the running Studio/u);
  });

  it("gives serve's own reason when serve refuses the start", slowTest, async () => {
    const message = "Acme changed since you trusted it.";
    await heldBy("serve", { ok: false, reason: "not-trusted", message });

    const { code, stderr } = await run(samsEmail);

    expect(code).toBe(exitCode.conflict);
    expect(stderr).toContain(`halonic serve didn't start the run: ${message}`);
  });

  it(
    "says to look in serve's --debug lines when the start failed without a reason",
    slowTest,
    async () => {
      await heldBy("serve", { ok: false, reason: "not-started" });

      const { code, stderr } = await run(samsEmail);

      expect(code).toBe(exitCode.unavailable);
      expect(stderr).toContain("halonic serve couldn't start the run.");
      expect(stderr).toContain("Start halonic serve with --debug to see why, then run again.");
    },
  );

  it("says the run may have started when serve doesn't answer in time", slowTest, async () => {
    let taken: () => void = () => {};
    const requestTaken = new Promise<void>((resolve) => {
      taken = resolve;
    });
    // Still starting the run when the call stops waiting.
    await heldBy("serve", () => {
      taken();
      return new Promise<object>(() => {});
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const running = run(samsEmail);
    await requestTaken;
    await vi.advanceTimersByTimeAsync(10_000);
    const { code, stderr } = await running;

    expect(code).toBe(exitCode.unavailable);
    expect(stderr).toContain(
      "halonic serve didn't answer in time, so the run may have started there.",
    );
    expect(stderr).toContain("See whether it did before you run it again: halonic runs list");
    expect(stderr).not.toContain("halonic serve is running for this workspace");
  });

  it("keeps the refusal when serve doesn't know the request", slowTest, async () => {
    await heldBy("serve", { ok: false, reason: "bad-request" });

    const { code, stderr } = await run(samsEmail);

    expect(code).toBe(exitCode.conflict);
    expect(stderr).toContain("halonic serve is running for this workspace");
  });

  it(
    "keeps the refusal when routines watch holds the engine, even with a console that answers",
    slowTest,
    async () => {
      await heldBy("routinesWatch");

      const { code, stderr } = await run(samsEmail);

      expect(code).toBe(exitCode.conflict);
      expect(stderr).toContain("halonic routines watch is running for this workspace");
      expect(asked).toEqual([]);
    },
  );

  for (const option of [
    ["--harness", "halonic"],
    ["--follow", "--json"],
  ]) {
    it(
      `keeps the refusal for ${option[0]}, which only a run followed here takes`,
      slowTest,
      async () => {
        await heldBy("serve");

        const { code } = await run([...samsEmail, ...option]);

        expect(code).toBe(exitCode.conflict);
        expect(asked).toEqual([]);
      },
    );
  }

  it("hands over a request of exactly what the console takes", slowTest, async () => {
    await heldBy("serve");
    const request = { op: "start-run", hubId: "support", workflowId: "support-reply" };
    // The socket counts the line without its line end: 4096 bytes of JSON fit.
    const around = JSON.stringify({ ...request, input: { mail: "" } }).length;
    const input = JSON.stringify({ mail: "x".repeat(4096 - around) });

    const { code } = await run(["--input", input]);

    expect(code).toBe(exitCode.ok);
    expect(asked).toHaveLength(1);
  });

  it("refuses an input too big for the console, and says why", slowTest, async () => {
    await heldBy("serve");
    const input = JSON.stringify({ mail: "x".repeat(5000) });

    const { code, stderr } = await run(["--input", input]);

    expect(code).toBe(exitCode.conflict);
    expect(stderr).toContain("The input is too big to hand to the running Studio (over 4 KB).");
    expect(asked).toEqual([]);
  });
});
