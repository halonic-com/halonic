import { cp, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileAgentPlacementStore, FileTrustStore } from "@halonicjs/adapter-fs-node";
import { AgentPlacement, agentFingerprint, RunHistory } from "@halonicjs/app";
import type { SandboxCheck } from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { CliCommand } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
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

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const writerPath = "hubs/support/agents/writer.agent.yaml";
const samsEmail = ["--input", "examples/refund-question.json"];
const noCommands = { path: undefined, endings: [] };

/** 9 Nov 2026, 10:00 UTC: when the person chose "On this computer". */
const chosen = Date.UTC(2026, 10, 9, 10);

const bubblewrapMissing: SandboxCheck = {
  ok: false,
  reason: "bubblewrap-missing",
  missing: ["bwrap was not found on PATH"],
};

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
let placement: AgentPlacement;
/** How often the sandbox was checked. */
let checks: number;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-sandbox-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "home") } };
  placement = new AgentPlacement({
    store: new FileAgentPlacementStore(join(folder, "placements")),
    digest: webCryptoDigest,
    clock: fixedClock(chosen),
  });
  checks = 0;
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/**
 * Acme's Writer with `lines` added to its file, such as a harness, and Acme
 * trusted as it is then: an agent in a harness reaches more than the test model.
 */
async function writerWith(lines: string): Promise<void> {
  const file = join(acme, writerPath);
  await writeFile(file, `${await readFile(file, "utf8")}${lines}`);
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const { subject } = await readWorkspaceTrust(dir, noCommands);
  const trust = cliTrustService(new FileTrustStore(join(folder, "trust")), fixedClock(chosen));
  const check = await trust.check(subject);
  expect((await trust.grant(subject, check.fingerprint, "cli")).ok).toBe(true);
}

/** A person chose "On this computer" for Writer, for its file as it is now. */
async function chooseThisComputer(): Promise<void> {
  const file = new Uint8Array(await readFile(join(acme, writerPath)));
  const subject = { location: await realpath(acme), agent: "writer", file };
  const shown = await agentFingerprint(file, webCryptoDigest);
  expect((await placement.chooseThisComputer(subject, shown)).ok).toBe(true);
}

/** `halonic run` on a computer whose sandbox check answers `check`. */
function runCommand(check: SandboxCheck): CliCommand {
  return runCommandWith({
    clock: () => ({ now: new Date(chosen), timeZone: "UTC" }),
    trust: () => ({
      trustStore: new FileTrustStore(join(folder, "trust")),
      clock: fixedClock(chosen),
      commandSearch: noCommands,
    }),
    http: { fetch: () => Promise.reject(new TypeError("The test model calls no server.")) },
    profile,
    sandboxGate: () => ({
      sandbox: {
        check: async () => {
          checks += 1;
          return check;
        },
      },
      placement,
    }),
  });
}

async function run(check: SandboxCheck, ...args: string[]) {
  const io = captureIo(acme);
  const code = await runCli(["run", "support-reply", ...samsEmail, ...args], io, [
    runCommand(check),
  ]);
  return { code, io };
}

async function runsKept(): Promise<number> {
  return (await new RunHistory(await openWorkspaceRuns(acme, profile)).listRuns()).total;
}

verifies("cli.run-sandbox-gate", () => {
  it("refuses a run whose agent needs the sandbox when it can't start, and starts nothing", async () => {
    await writerWith("harness: claude-code\n");

    const { code, io } = await run(bubblewrapMissing);

    expect(code).toBe(exitCode.unavailable);
    expect(io.stderr).toEqual([
      "✕ Couldn't run support-reply: the sandbox can't start on this computer. Nothing ran.",
      "  bubblewrap isn't installed. Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap, then run it again.",
      "  More: https://docs.halonic.dev/sandbox#bubblewrap (bubblewrap-missing)",
    ]);
    expect(io.stdout).toEqual([]);
    expect(await runsKept()).toBe(0);
  });

  it("doesn't check the sandbox for a workflow whose agents all run in Halonic", async () => {
    const { code } = await run(bubblewrapMissing);

    expect(code).toBe(exitCode.ok);
    expect(checks).toBe(0);
  });

  it("refuses an agent in a harness once the sandbox is fine, since this engine has no harness adapter", async () => {
    await writerWith("harness: claude-code\n");

    const { code, io } = await run({ ok: true, reason: null, missing: [] });

    expect(code).toBe(exitCode.unavailable);
    expect(io.stderr[0]).toBe(
      "✕ Couldn't run support-reply: Halonic can't run agents in Claude Code yet, and Writer is in Claude Code. Nothing ran.",
    );
    expect(io.stderr[1]).toBe("  Run it with --harness halonic.");
    expect(io.stdout).toEqual([]);
    expect(await runsKept()).toBe(0);
  });

  it("refuses an agent set to On this computer the same way, and starts nothing", async () => {
    await writerWith("harness: claude-code\n");
    await chooseThisComputer();

    const { code, io } = await run(bubblewrapMissing);

    expect(code).toBe(exitCode.unavailable);
    expect(checks).toBe(0);
    expect(io.stderr[0]).toContain("Halonic can't run agents in Claude Code yet");
    expect(await runsKept()).toBe(0);
  });

  it("has no option that runs without the sandbox (Julian, HAL-1673)", async () => {
    await writerWith("harness: claude-code\n");
    const options = Object.keys(runCommand(bubblewrapMissing).options ?? {});

    // `--harness` picks the harness, never the sandbox: a program it names is
    // checked like one the file names, and `halonic` starts no program
    // (`cli.run-harness`).
    expect(options.sort()).toEqual(["dir", "event", "harness", "input"]);
    for (const flag of ["--no-sandbox", "--unsafe", "--skip-sandbox", "--sandbox=off"]) {
      const { code } = await run(bubblewrapMissing, flag);
      expect(code).toBe(exitCode.usage);
    }
    expect(checks).toBe(0);
    expect(await runsKept()).toBe(0);
  });
});
