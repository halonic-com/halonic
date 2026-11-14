import { realpathSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { FileAgentPlacementStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { AgentPlacement } from "@halonicjs/app";
import type {
  Harness,
  HarnessBridgeServer,
  Sandbox,
  SandboxCheck,
  SandboxProfile,
} from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runCli } from "../../run-cli.ts";
import { openGitHistory } from "../../run-workspace.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
  writeFiles,
} from "../../test/acme-runs.ts";
import { captureIo } from "../../test/capture-io.ts";
import { fakeSignals } from "../../test/fake-signals.ts";
import { engineStart } from "../../test/run-setup.ts";
import { waitUntil } from "../../test/wait-until.test-helper.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { webCryptoDigest } from "../../workspace-runs.ts";
import { cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
import { serveCommandWith } from "./command.ts";

// A harness agent started over the served API, through the real engine and
// the CLI's harness host. The Node parts that would start a program are
// fakes: what the tests look at is where the fake program was started.

/** Git and the first start open from cold imports. */
const slowTest = { timeout: 60_000 };

let acmeRuns: AcmeRuns;
let runner: GitRunner;
let running: { signals: ReturnType<typeof fakeSignals>; serving: Promise<number> } | undefined;

/** The profiles the fake sandbox was opened with: one per harness program started. */
let fenced: SandboxProfile[];

beforeEach(async () => {
  fenced = [];
  acmeRuns = await makeAcmeRuns("serve-harness");
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
  runner = await GitRunner.create({ git: await testGit() });
  const vcs = new GitVcs(acmeRuns.acme, {
    runner,
    author: { name: "Test", email: "test@example.com" },
  });
  const entries = await readdir(acmeRuns.acme, { recursive: true, withFileTypes: true });
  await vcs.init();
  await vcs.stage(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => relative(acmeRuns.acme, join(entry.parentPath, entry.name)))
      .map((path) => path.replaceAll("\\", "/"))
      .filter((path) => !path.startsWith(".git/")),
  );
  await vcs.commit("First version");
});

afterEach(async () => {
  if (running !== undefined) {
    running.signals.send("SIGINT");
    await running.serving.catch(() => undefined);
    running = undefined;
  }
  await runner.close();
  await removeAcmeRuns(acmeRuns);
});

const sandboxStarts: SandboxCheck = { ok: true, reason: null, missing: [] };

/** A sandbox that starts no program, since the fake program is in this process, and records its profile. */
const recordingSandbox: Sandbox = {
  check: async () => ({ ok: true, reason: null, missing: [] }),
  capabilities: () => ({ files: "shared", strength: "os" }),
  open: async (profile) => {
    fenced.push(profile);
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

const claudeCode: Harness = {
  id: "claude-code",
  name: "Claude Code",
  detect: async () => ({ status: "ready", version: "2.1.0" }),
  environment: () => ({}),
  start: (task) => ({
    async *[Symbol.asyncIterator]() {
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

/** Trusts Acme as `halonic trust` does. */
async function trustAcme(): Promise<void> {
  const machine = acmeRunsSetup(acmeRuns).trust();
  const dir = await openWorkspaceDir(
    { positionals: [], options: { dir: acmeRuns.acme } },
    { cwd: acmeRuns.folder },
  );
  const { subject } = await readWorkspaceTrust(dir, machine.commandSearch);
  const service = cliTrustService(machine.trustStore, machine.clock);
  const check = await service.check(subject);
  if (!("fingerprint" in check)) throw new Error("Acme has no fingerprint.");
  await service.grant(subject, check.fingerprint, "cli");
}

async function serveAcme(sandbox: SandboxCheck = sandboxStarts): Promise<string> {
  const setup = acmeRunsSetup(acmeRuns);
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const command = serveCommandWith({
    ...setup,
    history: async (root) => openGitHistory(root, { git: await testGit() }),
    engine: {
      ...setup.engine,
      git: { git: await testGit() },
      harnessParts: {
        fenced: recordingSandbox,
        launcher: recordingSandbox,
        harnesses: { "claude-code": claudeCode },
        bridgeServer,
        platform: "linux",
      },
    },
    sandboxGate: () => ({
      sandbox: { check: async () => sandbox },
      placement: new AgentPlacement({
        store: new FileAgentPlacementStore(join(acmeRuns.folder, "placements")),
        digest: webCryptoDigest,
        clock: fixedClock(engineStart),
      }),
    }),
  });
  const serving = runCli(["serve", "--port", "0"], io, [command], {
    stop: { signals, exitNow: () => undefined },
  });
  running = { signals, serving };
  await waitUntil(() => io.stdout.length >= 1, slowTest);
  const found = /(http:\/\/localhost:\d+)/u.exec(io.stdout[0] ?? "");
  if (found?.[1] === undefined) throw new Error(`No address in ${JSON.stringify(io.stdout[0])}.`);
  return found[1];
}

function startChange(address: string, extra: Record<string, unknown> = {}): Promise<Response> {
  return fetch(`${address}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hubId: "lab", workflowId: "change", input: {}, ...extra }),
  });
}

verifies("cli.commands.serve.harness", () => {
  it(
    "runs a harness agent on this computer, in a folder of Halonic's own, and records the run",
    slowTest,
    async () => {
      await trustAcme();
      const address = await serveAcme();

      const started = await startChange(address);
      expect(started.status).toBe(200);
      const { id } = (await started.json()) as { id: string };

      await waitUntil(async () => {
        const summary = (await (await fetch(`${address}/api/runs/${id}`)).json()) as {
          status: string;
        };
        return summary.status === "completed";
      }, slowTest);
      expect(fenced).toHaveLength(1);
      // Windows may give a temp folder as its 8.3 short name, so compare real paths.
      const workingFolder = realpathSync.native(fenced[0]?.workingFolder ?? "");
      expect(workingFolder).toContain(realpathSync.native(acmeRuns.folder));
      expect(workingFolder.startsWith(realpathSync.native(acmeRuns.acme))).toBe(false);
    },
  );

  it("refuses a start that moves the agent, and starts no program", slowTest, async () => {
    await trustAcme();
    const address = await serveAcme();

    for (const extra of [{ harness: "codex" }, { placement: "this-computer" }]) {
      expect((await startChange(address, extra)).status).toBe(400);
    }
    expect(fenced).toEqual([]);
  });

  it(
    "checks the sandbox for each served run, and starts no program when it can't start",
    slowTest,
    async () => {
      await trustAcme();
      const address = await serveAcme({
        ok: false,
        reason: "bubblewrap-missing",
        missing: ["bwrap was not found on PATH"],
      });

      expect((await startChange(address)).status).toBe(500);
      expect(fenced).toEqual([]);
    },
  );
});
