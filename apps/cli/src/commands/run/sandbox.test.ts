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
import { removeTestFolder } from "../../test/remove-folder.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import {
  nodeProfileEnvironment,
  openWorkspaceRuns,
  webCryptoDigest,
} from "../../workspace-runs.ts";
import { assertTrustable, cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
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
  await removeTestFolder(folder);
});

/**
 * Acme's Writer with `lines` added to its file, such as a harness, and Acme
 * trusted as it is then: an agent in a harness reaches more than the test model.
 * Acme is no longer local only, since a harness there is an error in its files,
 * which `run` refuses before the sandbox (HAL-12978).
 */
async function writerWith(lines: string): Promise<void> {
  const file = join(acme, writerPath);
  await writeFile(file, `${await readFile(file, "utf8")}${lines}`);
  const settings = join(acme, "workspace.yaml");
  const localOnly = (await readFile(settings, "utf8")).replace(
    "localOnly: true",
    "localOnly: false",
  );
  await writeFile(settings, localOnly);
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const read = await readWorkspaceTrust(dir, noCommands);
  const { subject } = read;
  const trust = cliTrustService(new FileTrustStore(join(folder, "trust")), fixedClock(chosen));
  const check = await trust.check(subject);
  assertTrustable(check, read);
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
      "  bubblewrap isn't installed. Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap, then run it again. Or run it with --harness halonic, which runs every agent in Halonic's own loop and needs no sandbox.",
      "  More: https://docs.halonic.dev/security/sandbox/#bubblewrap (bubblewrap-missing)",
    ]);
    expect(io.stdout).toEqual([]);
    expect(await runsKept()).toBe(0);
  });

  it("never suggests On this computer as the way out of a refusal (HAL-12597)", async () => {
    await writerWith("harness: claude-code\n");

    const { io } = await run(bubblewrapMissing);

    // Line 1's "can't start on this computer." is lower case; the choice is "On this computer".
    expect(io.stderr.join("\n")).not.toContain("On this computer");
  });

  it("runs the same workflow with --harness halonic when the sandbox can't start, as the hint says", async () => {
    // A workspace with an agent in Claude Code isn't local only, or the file wouldn't validate.
    const workspaceFile = join(acme, "workspace.yaml");
    const settings = await readFile(workspaceFile, "utf8");
    await writeFile(workspaceFile, settings.replace("localOnly: true", "localOnly: false"));
    await writerWith("harness: claude-code\n");

    const { code } = await run(bubblewrapMissing, "--harness", "halonic");

    expect(code).toBe(exitCode.ok);
    expect(checks).toBe(0);
  });

  it("doesn't check the sandbox for a workflow whose agents all run in Halonic", async () => {
    const { code } = await run(bubblewrapMissing);

    expect(code).toBe(exitCode.ok);
    expect(checks).toBe(0);
  });

  // An agent set to "On this computer" isn't fenced, so the sandbox isn't asked; the run then
  // goes on to the trust check, which a workspace changed since it was trusted fails (HAL-6477).
  it("doesn't check the sandbox for an agent set to On this computer, and goes on to the trust check", async () => {
    // A harness agent sends its work to a cloud model, which a local-only workspace refuses.
    const settings = join(acme, "workspace.yaml");
    await writeFile(
      settings,
      (await readFile(settings, "utf8")).replace("localOnly: true", "localOnly: false"),
    );
    await writerWith("harness: claude-code\n");
    await chooseThisComputer();
    await rm(join(folder, "trust"), { recursive: true });

    const { code } = await run(bubblewrapMissing);

    expect(code).toBe(exitCode.notTrusted);
    expect(checks).toBe(0);
    expect(await runsKept()).toBe(0);
  });

  it("has no option that runs without the sandbox (Julian, HAL-1673)", async () => {
    await writerWith("harness: claude-code\n");
    const options = Object.keys(runCommand(bubblewrapMissing).options ?? {});

    // `--harness` picks the harness, never the sandbox: a program it names is
    // checked like one the file names, and `halonic` starts no program
    // (`cli.run-harness`).
    expect(options.sort()).toEqual(["dir", "event", "follow", "harness", "input"]);
    for (const flag of ["--no-sandbox", "--unsafe", "--skip-sandbox", "--sandbox=off"]) {
      const { code } = await run(bubblewrapMissing, flag);
      expect(code).toBe(exitCode.usage);
    }
    expect(checks).toBe(0);
    expect(await runsKept()).toBe(0);
  });
});
