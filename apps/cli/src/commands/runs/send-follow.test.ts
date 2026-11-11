import { mkdtempSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileAgentPlacementStore, FileTrustStore } from "@halonicjs/adapter-fs-node";
import { AgentPlacement, RunHistory } from "@halonicjs/app";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { SandboxCheck } from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { heavyTestTimeout } from "../../test/golden.ts";
import { engineStart, testRunSetup } from "../../test/run-setup.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import {
  nodeProfileEnvironment,
  openWorkspaceRuns,
  webCryptoDigest,
} from "../../workspace-runs.ts";
import { cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
import { runCommandWith } from "../run/command.ts";
import { runsCommandWith } from "./command.ts";

// `runs send` on the Acme example with the real engine on the test model:
// `halonic run` leaves Support reply waiting for the reply's approval, and
// `runs send` answers it in an engine of its own, as on a real computer.

/** The Acme example, on the test model: Support reply takes Sam's email down the refund path. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

const bubblewrapMissing: SandboxCheck = {
  ok: false,
  reason: "bubblewrap-missing",
  missing: ["bwrap was not found on PATH"],
};

const sandboxStarts: SandboxCheck = { ok: true, reason: null, missing: [] };

let folder: string;
let acme: string;
let profile: ProfileEnvironment;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-runs-send-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = {
    ...nodeProfileEnvironment(),
    variables: { HALONIC_HOME: mkdtempSync(join(folder, "profile-")) },
  };
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/**
 * Runs a `halonic` command in the Acme copy, with `run` and `runs` on the
 * test setup, on a computer whose sandbox check answers `sandbox`.
 */
async function halonic(
  args: readonly string[],
  sandbox: SandboxCheck = sandboxStarts,
): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acme);
  const placement = new AgentPlacement({
    store: new FileAgentPlacementStore(join(folder, "placements")),
    digest: webCryptoDigest,
    clock: fixedClock(engineStart),
  });
  const setup = {
    ...testRunSetup(folder, profile),
    sandboxGate: () => ({ sandbox: { check: async () => sandbox }, placement }),
  };
  const code = await runCli(args, io, [runCommandWith(setup), runsCommandWith(setup)]);
  return { code, io };
}

/** Starts Support reply on Sam's email, so it waits for the reply's approval. */
async function startWaitingRun(): Promise<void> {
  const { code } = await halonic([
    "run",
    "support-reply",
    "--input",
    "examples/refund-question.json",
  ]);
  expect(code).toBe(exitCode.ok);
}

/** The one run's events, to see that nothing was sent. */
async function eventsOfTheRun(): Promise<readonly RunEvent[]> {
  const runs = await openWorkspaceRuns(acme, profile);
  const [run] = (await new RunHistory(runs).listRuns()).runs;
  if (run === undefined) throw new Error("The test's run wasn't stored.");
  return runs.events(run.id);
}

/** Lets Writer reach a local Ollama, so a run in Acme reaches more than the test model. */
async function addOllama(): Promise<void> {
  await writeFile(join(acme, "providers/ollama.yaml"), "id: ollama\ntype: ollama\nlocal: true\n");
}

/** Adds a connector to Acme: a change its trust covers, unlike a provider. */
async function addNotesConnector(): Promise<void> {
  await mkdir(join(acme, "library/connectors"), { recursive: true });
  await writeFile(
    join(acme, "library/connectors/notes.connector.yaml"),
    "name: Notes\ntransport:\n  stdio:\n    command: notes-server\ntools:\n  approve: []\n",
  );
}

/**
 * Puts Writer in Claude Code, which needs the sandbox, and trusts Acme as it
 * is then, so only the sandbox check can stop a send.
 */
async function writerInClaudeCode(): Promise<void> {
  const file = join(acme, "hubs/support/agents/writer.agent.yaml");
  await writeFile(file, `${await readFile(file, "utf8")}harness: claude-code\n`);
  await trustAcme();
}

/** Trusts Acme as it is now, in the trust store every `halonic` command here reads. */
async function trustAcme(): Promise<void> {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const { subject } = await readWorkspaceTrust(dir, { path: undefined, endings: [] });
  const trust = cliTrustService(new FileTrustStore(join(folder, "trust")), fixedClock(engineStart));
  const check = await trust.check(subject);
  expect((await trust.grant(subject, check.fingerprint, "cli")).ok).toBe(true);
}

verifies("cli.commands.runs.send", () => {
  // Each test starts Support reply and then sends to it: 3–10 s in CI at
  // worst (HAL-5473).
  describe("a run that's waiting for you", { timeout: heavyTestTimeout }, () => {
    it("sends the event, says the run goes on, and follows it to its end", async () => {
      await startWaitingRun();

      const { code, io } = await halonic(["runs", "send", "01JD8Q", "approve"]);

      expect(io.stderr).toEqual([]);
      expect(code).toBe(exitCode.ok);
      expect(io.stdout.slice(0, 2)).toEqual([
        "✓ Sent approve to run 01jd8q. Support reply goes on.",
        "",
      ]);
      expect(io.stdout).toContainEqual(expect.stringMatching(/^✓ Support reply finished in /));
      expect((await eventsOfTheRun()).at(-1)?.type).toBe("run.completed");
    });

    it("gives the run and its events as they are at the end with --json", async () => {
      await startWaitingRun();

      const { code, io } = await halonic(["runs", "send", "01jd8q", "approve", "--json"]);

      expect(code).toBe(exitCode.ok);
      const output = JSON.parse(io.stdout.join("\n")) as {
        run: RunSummary;
        events: readonly RunEvent[];
      };
      expect(output.run.status).toBe("completed");
      expect(output.events.at(-1)?.type).toBe("run.completed");
    });
  });

  // Each test starts Support reply, then changes the workspace and tries to
  // send: about 3.5 s in CI at worst (HAL-5473).
  describe("before anything is sent", { timeout: heavyTestTimeout }, () => {
    it("refuses a workspace that was never trusted here, and sends nothing", async () => {
      await startWaitingRun();
      const before = await eventsOfTheRun();
      await addOllama();

      const { code, io } = await halonic(["runs", "send", "01jd8q", "approve"]);

      expect(code).toBe(exitCode.notTrusted);
      expect(io.stderr).toContain(
        "✕ Couldn't send approve to run 01jd8q: Acme isn't trusted on this computer yet. Nothing was sent.",
      );
      expect(await eventsOfTheRun()).toEqual(before);
    });

    it("refuses a workspace that changed since it was trusted, and sends nothing", async () => {
      await startWaitingRun();
      const before = await eventsOfTheRun();
      await addOllama();
      await trustAcme();
      await addNotesConnector();

      const { code, io } = await halonic(["runs", "send", "01jd8q", "approve"]);

      expect(code).toBe(exitCode.notTrusted);
      expect(io.stderr).toContain(
        "✕ Couldn't send approve to run 01jd8q: Acme changed since you trusted it. Nothing was sent.",
      );
      expect(await eventsOfTheRun()).toEqual(before);
    });

    it("refuses a run whose agent needs the sandbox when it can't start, and sends nothing", async () => {
      await startWaitingRun();
      const before = await eventsOfTheRun();
      await writerInClaudeCode();

      const { code, io } = await halonic(["runs", "send", "01jd8q", "approve"], bubblewrapMissing);

      expect(code).toBe(exitCode.unavailable);
      expect(io.stderr[0]).toBe(
        "✕ Couldn't send approve to run 01jd8q: the sandbox can't start on this computer. Nothing was sent.",
      );
      expect(await eventsOfTheRun()).toEqual(before);
    });
  });
});
