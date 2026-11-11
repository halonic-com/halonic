import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileAgentPlacementStore, FileTrustStore } from "@halonicjs/adapter-fs-node";
import { AgentPlacement, RunHistory } from "@halonicjs/app";
import type { HarnessDetection, SandboxCheck } from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliCommand } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { exitCodeOfError } from "../../exit-code-for.ts";
import type { HarnessProgram } from "../../harness-programs.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import {
  nodeProfileEnvironment,
  openWorkspaceRuns,
  webCryptoDigest,
} from "../../workspace-runs.ts";
import { cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
import { runCommandWith } from "./command.ts";
import { RunHarnessError, runHarnessOf } from "./harness.ts";

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const writerPath = "hubs/support/agents/writer.agent.yaml";
const samsEmail = ["--input", "examples/refund-question.json"];
const noCommands = { path: undefined, endings: [] };
const now = Date.UTC(2026, 10, 11, 9);

const sandboxReady: SandboxCheck = { ok: true, reason: null, missing: [] };
const bubblewrapMissing: SandboxCheck = {
  ok: false,
  reason: "bubblewrap-missing",
  missing: ["bwrap was not found on PATH"],
};

/** Claude Code and Codex, each found as `detection` says. */
function programs(claudeCode: HarnessDetection, codex: HarnessDetection): HarnessProgram[] {
  return [
    { id: "claude-code", name: "Claude Code", detect: async () => claudeCode },
    { id: "codex", name: "Codex", detect: async () => codex },
  ];
}

const claudeCodeReady = programs({ status: "ready", version: "2.1.0" }, { status: "missing" });

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
/** How often the sandbox was checked. */
let checks: number;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-harness-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "home") } };
  checks = 0;
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** Acme trusted as it is now. */
async function trustAcme(): Promise<void> {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const { subject } = await readWorkspaceTrust(dir, noCommands);
  const trust = cliTrustService(new FileTrustStore(join(folder, "trust")), fixedClock(now));
  const check = await trust.check(subject);
  expect((await trust.grant(subject, check.fingerprint, "cli")).ok).toBe(true);
}

/** `halonic run` on a computer with these harness programs, whose sandbox check answers `check`. */
function runCommand(harnesses: readonly HarnessProgram[], check: SandboxCheck): CliCommand {
  return runCommandWith({
    clock: () => ({ now: new Date(now), timeZone: "UTC" }),
    trust: () => ({
      trustStore: new FileTrustStore(join(folder, "trust")),
      clock: fixedClock(now),
      commandSearch: noCommands,
    }),
    http: { fetch: () => Promise.reject(new TypeError("The test model calls no server.")) },
    profile,
    harnesses: () => harnesses,
    sandboxGate: () => ({
      sandbox: {
        check: async () => {
          checks += 1;
          return check;
        },
      },
      placement: new AgentPlacement({
        store: new FileAgentPlacementStore(join(folder, "placements")),
        digest: webCryptoDigest,
        clock: fixedClock(now),
      }),
    }),
  });
}

async function run(
  harnesses: readonly HarnessProgram[],
  check: SandboxCheck,
  ...args: string[]
): Promise<{ code: number; stderr: string[] }> {
  const io = captureIo(acme);
  const code = await runCli(["run", "support-reply", ...samsEmail, ...args], io, [
    runCommand(harnesses, check),
  ]);
  return { code, stderr: io.stderr };
}

/** The runs Acme has, each with the harness its `run.started` names. */
async function startedRuns(): Promise<{ status: string; harness: string | undefined }[]> {
  const history = new RunHistory(await openWorkspaceRuns(acme, profile));
  const listed = await history.listRuns();
  return Promise.all(
    listed.runs.map(async (each) => {
      const shown = await history.showRun(each.id);
      const events = shown.found === "one" ? shown.run.events : [];
      const started = events.find((event) => event.type === "run.started");
      const harness = started?.type === "run.started" ? started.harness : undefined;
      return { status: each.status, harness };
    }),
  );
}

verifies("cli.run-harness", () => {
  describe("halonic run --harness", () => {
    it("refuses a name that isn't a harness, before anything runs", async () => {
      const { code, stderr } = await run(claudeCodeReady, sandboxReady, "--harness", "claude");

      expect(code).toBe(exitCode.usage);
      expect(stderr).toEqual([
        "✕ Couldn't run support-reply: there's no harness called claude. Nothing ran.",
        "  Use halonic, claude-code or codex, or leave --harness out to run each agent in its own.",
      ]);
      expect(await startedRuns()).toEqual([]);
    });

    it("refuses a harness that isn't installed, before anything runs", async () => {
      await trustAcme();
      const { code, stderr } = await run(claudeCodeReady, sandboxReady, "--harness", "codex");

      expect(code).toBe(exitCode.unavailable);
      expect(stderr).toEqual([
        "✕ Couldn't run support-reply: Codex isn't installed on this computer. Nothing ran.",
        "  Install Codex, then run again.",
      ]);
      expect(checks).toBe(0);
      expect(await startedRuns()).toEqual([]);
    });

    it("needs trust for a harness program, even when the workspace only reaches the test model", async () => {
      const { code } = await run(claudeCodeReady, sandboxReady, "--harness", "claude-code");

      expect(code).toBe(exitCode.notTrusted);
      expect(await startedRuns()).toEqual([]);
    });

    it("checks the sandbox for every agent the harness program now runs", async () => {
      await trustAcme();
      const { code } = await run(claudeCodeReady, bubblewrapMissing, "--harness", "claude-code");

      expect(code).toBe(exitCode.unavailable);
      expect(checks).toBe(1);
      expect(await startedRuns()).toEqual([]);
    });

    it("refuses to move an agent whose working folder no check read into a program", async () => {
      const writer = join(acme, writerPath);
      await writeFile(writer, `${await readFile(writer, "utf8")}workingFolder: tools\n`);
      await trustAcme();
      const { code, stderr } = await run(claudeCodeReady, sandboxReady, "--harness", "claude-code");

      expect(code).toBe(exitCode.usage);
      expect(stderr).toEqual([
        "✕ Couldn't run support-reply: Writer names allowed sites or a working folder, but its file runs it in Halonic's own loop, so they were never checked. Nothing ran.",
        "  Name a harness in Writer's file and trust the workspace again, or remove allowed sites and the working folder from it.",
      ]);
      expect(checks).toBe(0);
      expect(await startedRuns()).toEqual([]);
    });

    it("passes every check, then refuses it as this computer's engine has no harness adapter yet", async () => {
      await trustAcme();
      const { code, stderr } = await run(claudeCodeReady, sandboxReady, "--harness", "claude-code");

      expect(code).toBe(exitCode.unavailable);
      expect(stderr[0]).toBe(
        "✕ Couldn't run support-reply: Halonic can't run agents in Claude Code yet, and Writer is in Claude Code. Nothing ran.",
      );
      expect(checks).toBe(1);
      expect(await startedRuns()).toEqual([]);
    });

    it("runs every agent in Halonic's own loop with halonic, without trust or the sandbox", async () => {
      const { code } = await run(claudeCodeReady, bubblewrapMissing, "--harness", "halonic");

      expect(code).toBe(exitCode.ok);
      expect(checks).toBe(0);
      expect(await startedRuns()).toEqual([{ status: "waiting", harness: "halonic" }]);
    });
  });

  describe("runHarnessOf", () => {
    it("allows a program that is signed out: it can run with a key Halonic holds", async () => {
      const signedOut = programs({ status: "signed-out", version: "2.1.0" }, { status: "missing" });

      expect(await runHarnessOf("claude-code", signedOut)).toBe("claude-code");
    });

    it.each([
      [
        { status: "unsupported", version: "0.9.1", supported: ">=1.0.0" },
        "Claude Code 0.9.1 isn't supported. Halonic needs 1.0.0 or newer. Nothing ran.",
        "Update Claude Code, then run again.",
      ],
      [
        { status: "failed", error: "`claude --version` didn't print a version." },
        "Halonic found Claude Code but couldn't ask its version: `claude --version` didn't print a version. Nothing ran.",
        "Check that Claude Code starts in a terminal, then run again.",
      ],
    ] as const)("refuses a program that can't start: %j", async (detection, reason, fix) => {
      const failure = await runHarnessOf(
        "claude-code",
        programs(detection, { status: "missing" }),
      ).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(RunHarnessError);
      expect(exitCodeOfError(failure)).toBe(exitCode.unavailable);
      expect((failure as RunHarnessError).message).toBe(reason);
      expect((failure as RunHarnessError).fix).toBe(fix);
    });

    it("gives no harness without the option", async () => {
      expect(await runHarnessOf(undefined, [])).toBeUndefined();
    });
  });
});
