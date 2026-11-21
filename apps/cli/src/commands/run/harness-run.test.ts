import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FileAgentPlacementStore, FileInstructionTrustStore } from "@halonicjs/adapter-fs-node";
import { AgentPlacement, agentFingerprint } from "@halonicjs/app";
import type { Harness, HarnessBridgeServer, Sandbox, SandboxCheck } from "@halonicjs/ports";
import { placementFolder, profileFolder } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { instructionTrustFolder } from "../../local-harness-host.ts";
import { runCli } from "../../run-cli.ts";
import { savedFile } from "../../test/acme-proposals.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
  writeFiles,
} from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { engineStart } from "../../test/run-setup.ts";
import { trustInstructions } from "../../test/trust-instructions.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { webCryptoDigest } from "../../workspace-runs.ts";
import { cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
import { createTrustInstructionsCommand } from "../trust/instructions.ts";
import { runCommandWith } from "./command.ts";
import type { RunSetup } from "./run.ts";

// `halonic run` with an agent in Claude Code, through the real engine and the
// CLI's harness host, in a workspace with history off. The Node parts that
// would start a program are fakes: the fake program writes in the folder the
// sandbox was opened on, as the real one would.

/** The first start opens from cold imports. */
const slowTest = { timeout: 60_000 };

/** Where the coder's `change.txt` lands: its working folder is its own folder under `files`. */
const changedFile = "files/agents/coder/change.txt";

let acmeRuns: AcmeRuns;
/** What the fake program writes, by path, in its working folder. */
let writes: Record<string, string>;
/** The working folder of each program the fake sandbox opened a session for. */
let workingFolders: string[];
/** Which fake sandbox, `fenced` or `launcher`, opened each session. */
let openedBy: string[];
/** How often the fake program started. */
let harnessStarts: number;
/** How often the CLI asked whether the sandbox starts, before the run. */
let sandboxChecks: number;
/** A person's "On this computer" choices, in the profile's folder, where the engine reads them too. */
let placement: AgentPlacement;
/** One setup per test, so a second run in it gets the next run id, not the first one's again. */
let setup: RunSetup;

beforeEach(async () => {
  writes = {};
  workingFolders = [];
  openedBy = [];
  harnessStarts = 0;
  sandboxChecks = 0;
  acmeRuns = await makeAcmeRuns("run-harness-on");
  setup = acmeRunsSetup(acmeRuns);
  placement = new AgentPlacement({
    store: new FileAgentPlacementStore(placementFolder(profileFolder(acmeRuns.profile))),
    digest: webCryptoDigest,
    clock: fixedClock(engineStart),
  });
  await writeFiles(acmeRuns.acme, {
    // Harness agents send their work to a cloud model, which a local-only workspace refuses.
    "workspace.yaml":
      "id: acme\nname: Acme\nprivacy:\n  localOnly: false\ndefaults:\n  model: default\n",
    "hubs/lab/hub.yaml": "id: lab\nname: Lab\n",
    "hubs/lab/agents/coder.agent.yaml":
      "id: coder\nname: Coder\nharness: claude-code\ninstructions: Write the change.\n",
    "hubs/lab/workflows/change.workflow.yaml": [
      "id: change",
      "name: Change",
      "initial: code",
      "states:",
      "  code:",
      "    description: Write the file",
      "    agent: coder",
      "    input: Write the change.",
      "    output: change",
      "    on:",
      "      - to: done",
      "  done:",
      "    type: final",
      "    description: Done",
      "",
    ].join("\n"),
  });
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

const sandboxStarts: SandboxCheck = { ok: true, reason: null, missing: [] };

/**
 * A sandbox that starts no program, since the fake program is in this process.
 * `label` tells the fenced one from the launcher in `openedBy`.
 */
function recordingSandbox(label: string): Sandbox {
  return {
    check: async () => sandboxStarts,
    capabilities: () => ({ files: "shared", strength: "os" }),
    open: async (profile) => {
      workingFolders.push(profile.workingFolder ?? "");
      openedBy.push(label);
      return {
        profile,
        fence: { state: "fenced" },
        start: async () => {
          throw new Error("The fake sandbox starts no program.");
        },
        onBlocked: () => () => {},
        close: async () => {},
      };
    },
  };
}

/** Claude Code, which writes `writes` in its working folder and finishes. */
const claudeCode: Harness = {
  id: "claude-code",
  name: "Claude Code",
  detect: async () => ({ status: "ready", version: "2.1.0" }),
  environment: () => ({}),
  start: (task, session) => ({
    async *[Symbol.asyncIterator]() {
      harnessStarts += 1;
      for (const [path, text] of Object.entries(writes)) {
        const file = join(session.profile.workingFolder ?? "", path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, text);
      }
      yield { type: "agent.finished", agent: task.agentId, output: "done" };
    },
    send: async () => {
      throw new Error("The fake program asks nothing.");
    },
    cancel: async () => {},
  }),
};

const bridgeServer: HarnessBridgeServer = {
  open: async () => ({
    url: "http://127.0.0.1:41817",
    token: "not-a-real-token",
    close: async () => {},
  }),
};

/** Trusts Acme as `halonic trust` does, and the coder's instructions as a person would. */
async function trustAcme(): Promise<void> {
  await trustWorkspace();
  await trustInstructions({
    profile: acmeRuns.profile,
    workspace: acmeRuns.acme,
    agent: "coder",
    text: "Write the change.",
  });
}

/** Trusts Acme as `halonic trust` does, and leaves the coder's instructions untrusted. */
async function trustWorkspace(): Promise<void> {
  const machine = acmeRunsSetup(acmeRuns).trust();
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acmeRuns.acme });
  const { subject } = await readWorkspaceTrust(dir, machine.commandSearch);
  const service = cliTrustService(machine.trustStore, machine.clock);
  const check = await service.check(subject);
  if (!("fingerprint" in check)) throw new Error("Acme has no fingerprint.");
  await service.grant(subject, check.fingerprint, "cli");
}

/** A person chose "On this computer" for the coder, for its file as it is now. */
async function chooseThisComputer(): Promise<void> {
  const file = new Uint8Array(
    await readFile(join(acmeRuns.acme, "hubs/lab/agents/coder.agent.yaml")),
  );
  const subject = { location: await realpath(acmeRuns.acme), hub: "lab", agent: "coder", file };
  const shown = await agentFingerprint(file, webCryptoDigest);
  expect((await placement.chooseThisComputer(subject, shown)).ok).toBe(true);
}

async function runChange(...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acmeRuns.acme);
  const command = runCommandWith({
    ...setup,
    engine: {
      ...setup.engine,
      harnessParts: {
        fenced: recordingSandbox("fenced"),
        launcher: recordingSandbox("launcher"),
        harnesses: { "claude-code": claudeCode },
        bridgeServer,
        platform: "linux",
      },
    },
    sandboxGate: () => ({
      sandbox: {
        check: async () => {
          sandboxChecks += 1;
          return sandboxStarts;
        },
      },
      placement,
    }),
  });
  const code = await runCli(["run", "lab/change", ...args], io, [command]);
  return { code, io };
}

verifies("cli.run-proposal", () => {
  it(
    "runs the agent in Claude Code, and ends with the proposal waiting, the files unchanged",
    slowTest,
    async () => {
      await trustAcme();
      writes = { "change.txt": "The change.\n" };

      const { code, io } = await runChange();

      expect(code).toBe(exitCode.ok);
      expect(openedBy).toEqual(["fenced"]);
      // The engine reuses the answer `halonic run` got before the run (Julian, HAL-13057).
      expect(sandboxChecks).toBe(1);
      expect(workingFolders).toHaveLength(1);
      expect(workingFolders[0]?.startsWith(acmeRuns.acme)).toBe(false);
      const last = io.stdout.at(-1) ?? "";
      expect(last).toMatch(
        /^Run [0-9a-z]{6} proposes changes to 1 file\. Nothing in your files changed yet: see them with halonic proposals show [0-9a-z]{6}\.$/u,
      );
      expect(await savedFile(acmeRuns, changedFile)).toBeNull();
    },
  );

  it("gives the proposal in --json", slowTest, async () => {
    await trustAcme();
    writes = { "change.txt": "The change.\n" };

    const { io } = await runChange("--json");

    const json = JSON.parse(io.stdout.join("\n"));
    expect(json.proposal.files).toEqual([
      expect.objectContaining({ path: changedFile, change: "added" }),
    ]);
  });

  it("says nothing of a proposal when the agent changed no file", slowTest, async () => {
    await trustAcme();

    const { code, io } = await runChange();

    expect(code).toBe(exitCode.ok);
    expect(io.stdout.join("\n")).not.toContain("proposes changes");
  });

  it(
    "runs an agent set to On this computer without the sandbox, and says so",
    slowTest,
    async () => {
      await trustAcme();
      await chooseThisComputer();
      writes = { "change.txt": "The change.\n" };

      const { code, io } = await runChange();

      expect(code).toBe(exitCode.ok);
      expect(openedBy).toEqual(["launcher"]);
      expect([...io.stdout, ...io.stderr]).toContainEqual(
        expect.stringMatching(
          /^! Coder runs on this computer without the sandbox, as chosen on .+\.$/u,
        ),
      );
    },
  );

  it(
    "starts no program for instructions nobody trusted, and leaves no proposal",
    slowTest,
    async () => {
      await trustWorkspace();
      writes = { "change.txt": "The change.\n" };

      const { code, io } = await runChange();

      expect(code).toBe(exitCode.failed);
      expect(harnessStarts).toBe(0);
      expect(io.stdout.join("\n")).not.toContain("proposes changes");
      expect(await savedFile(acmeRuns, changedFile)).toBeNull();
    },
  );

  it("shows the trust check for a workspace that isn't trusted, and runs nothing", async () => {
    const { code } = await runChange();

    expect(code).toBe(exitCode.notTrusted);
    expect(workingFolders).toEqual([]);
  });
});

verifies("cli.run-failed-instructions", () => {
  /** `halonic trust instructions coder` with no terminal, then with the fingerprint it printed. */
  async function trustCoderInstructions(): Promise<number> {
    const trust = createTrustInstructionsCommand(() => ({
      store: new FileInstructionTrustStore(instructionTrustFolder(profileFolder(acmeRuns.profile))),
      clock: fixedClock(engineStart),
    }));
    const trustAgain = (...args: string[]) =>
      runCli(["instructions", "coder", ...args], captureIo(acmeRuns.acme), [trust]);
    const shown = captureIo(acmeRuns.acme);
    await runCli(["instructions", "coder"], shown, [trust]);
    return await trustAgain("--yes", "--fingerprint", shown.stdout.at(-1) ?? "");
  }

  it(
    "says how to trust instructions nobody trusted, and runs once they are",
    slowTest,
    async () => {
      await trustWorkspace();
      writes = { "change.txt": "The change.\n" };

      const refused = await runChange();

      expect(refused.code).toBe(exitCode.failed);
      expect(harnessStarts).toBe(0);
      const shown = [...refused.io.stdout, ...refused.io.stderr].join("\n");
      expect(shown).toContain(
        "coder didn't start, because nobody has trusted its instructions on this computer yet.",
      );
      expect(shown).toContain(
        "Review them and trust them with halonic trust instructions coder, then run again.",
      );
      expect(shown).not.toContain("can't tell the cause");

      expect(await trustCoderInstructions()).toBe(exitCode.ok);
      const { code } = await runChange();

      expect(code).toBe(exitCode.ok);
      expect(harnessStarts).toBe(1);
    },
  );
});
