import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { AgentPlacement, agentFingerprint, type RunDetail } from "@halonicjs/app";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import {
  type AgentPlacementKey,
  type AgentPlacementRecord,
  type AgentPlacementStore,
  type SandboxCheck,
  sandboxUnavailableReasons,
} from "@halonicjs/ports";
import { errorKindOf, fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCodeOfError } from "./exit-code-for.ts";
import { phrase, plainText } from "./messages/phrase.ts";
import { sandboxMessages } from "./messages/sandbox.ts";
import { printError } from "./print-error.ts";
import {
  checkRunSandbox,
  programAgentsOf,
  type SandboxGateMachine,
  SandboxRefusedError,
  sandboxRunOf,
  unsandboxedLine,
} from "./sandbox-gate.ts";
import { webCryptoDigest } from "./workspace-runs.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-sandbox-gate-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const hub = "hubs/support/hub.yaml";
const writer = "hubs/support/agents/writer.agent.yaml";
const writerFile = "id: writer\nname: Writer\ninstructions: Write.\nharness: claude-code\n";
const supportReply = { hubId: "support", workflowId: "support-reply" };

/** A stored run of Support reply that named `harness` for all its agents when it started. */
function storedRun(harness: string | undefined): RunDetail {
  const started: RunEvent = {
    type: "run.started",
    runId: "run_mfx3k2a1_09d9a0",
    seq: 1,
    at: "2026-11-10T10:40:00.000Z",
    ...supportReply,
    input: {},
    kind: "run",
    definitionsVersion: "v1",
    ...(harness === undefined ? {} : { harness }),
  };
  // The check reads only the hub and workflow of the summary.
  return { summary: { ...supportReply } as RunSummary, events: [started] };
}

/** A one-step workflow whose step runs `agent`. */
function oneStep(id: string, agent: string): string {
  return `id: ${id}\nname: ${id}\ninitial: draft\nstates:\n  draft:\n    agent: ${agent}\n    on:\n      - to: done\n  done:\n    type: final\n`;
}

/** Acme's support hub with Writer in Claude Code, and the files laid over it. */
async function workspaceOf(files: Record<string, string> = {}): Promise<LoadedWorkspace> {
  const all = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    [hub]: "id: support\nname: Support\n",
    [writer]: writerFile,
    "hubs/support/workflows/support-reply.workflow.yaml": oneStep("support-reply", "writer"),
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return loadWorkspace(new FolderDefinitionStore(root, "./acme"));
}

/** The "this computer" choices of one computer's profile. */
class ProfileChoices implements AgentPlacementStore {
  readonly records = new Map<string, AgentPlacementRecord>();
  async get(key: AgentPlacementKey) {
    return this.records.get(`${key.location}\n${key.agent}`) ?? null;
  }
  async save(record: AgentPlacementRecord) {
    this.records.set(`${record.location}\n${record.agent}`, record);
  }
  async remove(key: AgentPlacementKey) {
    this.records.delete(`${key.location}\n${key.agent}`);
  }
}

const bubblewrapMissing: SandboxCheck = {
  ok: false,
  reason: "bubblewrap-missing",
  missing: ["bwrap was not found on PATH"],
};

/** This computer, with its sandbox check and its choices; `checks` counts the sandbox checks. */
function machineWith(check: SandboxCheck, choices = new ProfileChoices()) {
  const placement = new AgentPlacement({
    store: choices,
    digest: webCryptoDigest,
    clock: fixedClock(Date.parse("2026-11-09T10:00:00.000Z")),
  });
  const machine: SandboxGateMachine & { checks: number } = {
    checks: 0,
    sandbox: {
      check: async () => {
        machine.checks += 1;
        return check;
      },
    },
    placement,
    location: "/work/acme",
    readFile: async (path) => new Uint8Array(readFileSync(join(root, path))),
  };
  return { machine, placement };
}

/** A person chose "On this computer" for Writer, after the warning, for the file as it is now. */
async function chooseThisComputer(placement: AgentPlacement): Promise<void> {
  const file = new Uint8Array(readFileSync(join(root, writer)));
  const subject = { location: "/work/acme", agent: "writer", file };
  const shown = await agentFingerprint(file, webCryptoDigest);
  expect((await placement.chooseThisComputer(subject, shown)).ok).toBe(true);
}

/** The refusal as the CLI prints it after "Couldn't run support-reply:", as plain text. */
function printed(error: unknown, debug = false): string[] {
  const lines: string[] = [];
  printError(error, (line) => lines.push(plainText(line)), {
    action: { key: "run.action", phrase: phrase`run support-reply` },
    debug,
  });
  return lines;
}

/** What `checkRunSandbox` threw. */
async function refusal(run: Promise<unknown>): Promise<SandboxRefusedError> {
  const error = await run.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(SandboxRefusedError);
  return error as SandboxRefusedError;
}

verifies("cli.sandbox-gate", () => {
  describe("which agents need the check", () => {
    it("finds the program agents of the workflow, its sub-workflows and its branches, each once", async () => {
      const workspace = await workspaceOf({
        "hubs/support/agents/sorter.agent.yaml": "id: sorter\nname: Sorter\ninstructions: Sort.\n",
        "hubs/support/agents/coder.agent.yaml":
          "id: coder\nname: Coder\ninstructions: Code.\nharness: codex\n",
        "hubs/support/agents/helper.agent.yaml":
          "id: helper\nname: Helper\ninstructions: Help.\nharness: halonic\n",
        "hubs/support/workflows/support-reply.workflow.yaml":
          "id: support-reply\nname: Support reply\ninitial: sort\nstates:\n  sort:\n    agent: sorter\n    on:\n      - to: both\n  both:\n    type: parallel\n    branches:\n      a: { agent: writer }\n      b: { agent: helper }\n    on:\n      - to: fix\n  fix:\n    type: workflow\n    workflow: fix-it\n    on:\n      - to: done\n  done:\n    type: final\n",
        "hubs/support/workflows/fix-it.workflow.yaml": oneStep("fix-it", "coder"),
      });

      const agents = programAgentsOf(workspace, supportReply);

      expect(agents.map((agent) => agent.value.id)).toEqual(["writer", "coder"]);
    });

    it("doesn't check the sandbox for a workflow that starts no program", async () => {
      const workspace = await workspaceOf({
        "hubs/support/agents/sorter.agent.yaml": "id: sorter\nname: Sorter\ninstructions: Sort.\n",
        "hubs/support/workflows/sort.workflow.yaml": oneStep("sort", "sorter"),
      });
      const { machine } = machineWith(bubblewrapMissing);

      expect(
        await checkRunSandbox(workspace, { hubId: "support", workflowId: "sort" }, machine),
      ).toEqual([]);
      expect(machine.checks).toBe(0);
    });
  });

  describe("the run's harness, in place of each agent's own (Liam, HAL-4305)", () => {
    it("checks for an agent with no harness of its own when the run names claude-code", async () => {
      const workspace = await workspaceOf({
        [writer]: "id: writer\nname: Writer\ninstructions: Write.\n",
      });
      const { machine } = machineWith(bubblewrapMissing);

      const error = await refusal(
        checkRunSandbox(workspace, { ...supportReply, harness: "claude-code" }, machine),
      );

      expect(exitCodeOfError(error)).toBe(9);
    });

    it("doesn't check for a claude-code agent when the run names halonic", async () => {
      const workspace = await workspaceOf();
      const { machine } = machineWith(bubblewrapMissing);

      expect(
        await checkRunSandbox(workspace, { ...supportReply, harness: "halonic" }, machine),
      ).toEqual([]);
      expect(machine.checks).toBe(0);
    });

    it("takes a stored run's harness from its run.started, for runs send", async () => {
      const workspace = await workspaceOf({
        [writer]: "id: writer\nname: Writer\ninstructions: Write.\n",
      });
      const { machine } = machineWith(bubblewrapMissing);

      const run = sandboxRunOf(storedRun("claude-code"));

      expect(run).toEqual({ ...supportReply, harness: "claude-code" });
      expect(exitCodeOfError(await refusal(checkRunSandbox(workspace, run, machine)))).toBe(9);
    });

    it("leaves each agent in its own harness when the stored run named none", async () => {
      const workspace = await workspaceOf();
      const { machine } = machineWith(bubblewrapMissing);

      const run = sandboxRunOf(storedRun(undefined));

      expect(run).toEqual(supportReply);
      expect(exitCodeOfError(await refusal(checkRunSandbox(workspace, run, machine)))).toBe(9);
    });
  });

  describe("a sandbox that can't start", () => {
    it("refuses the run with cli-output 3.8's three lines and exit 9", async () => {
      const workspace = await workspaceOf();
      const { machine } = machineWith(bubblewrapMissing);

      const error = await refusal(checkRunSandbox(workspace, supportReply, machine));

      expect(errorKindOf(error)).toBe("unavailable");
      expect(exitCodeOfError(error)).toBe(9);
      expect(printed(error)).toEqual([
        "✕ Couldn't run support-reply: the sandbox can't start on this computer. Nothing ran.",
        "  bubblewrap isn't installed. Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap, then run it again.",
        "  More: https://docs.halonic.com/sandbox#bubblewrap (bubblewrap-missing)",
      ]);
    });

    it("ends line 1 with Nothing was sent. for runs send", async () => {
      const workspace = await workspaceOf();
      const { machine } = machineWith(bubblewrapMissing);

      const error = await refusal(
        checkRunSandbox(workspace, supportReply, machine, sandboxMessages.nothingSent()),
      );

      expect(error.message).toBe("the sandbox can't start on this computer. Nothing was sent.");
    });

    it.each([...sandboxUnavailableReasons, "a-code-from-a-later-port"])(
      "words %s from the code alone, never the check's own sentence",
      async (code) => {
        const workspace = await workspaceOf();
        const sentence = "the check's own sentence, for logs only";
        const { machine } = machineWith({
          ok: false,
          reason: code as "other",
          missing: [sentence],
        });

        const error = await refusal(checkRunSandbox(workspace, supportReply, machine));

        expect(error.fix).toBe(plainText(sandboxMessages.refusedFix(code).phrase));
        expect(error.code).toBe(code);
        expect(printed(error).join("\n")).not.toContain(sentence);
        expect(printed(error, true).join("\n")).toContain(sentence);
      },
    );
  });

  describe("an agent set to On this computer (Julian, HAL-1673)", () => {
    it("runs without the check and gives the ! line, with the day it was chosen", async () => {
      const workspace = await workspaceOf();
      const { machine, placement } = machineWith(bubblewrapMissing);
      await chooseThisComputer(placement);

      const unsandboxed = await checkRunSandbox(workspace, supportReply, machine);

      expect(machine.checks).toBe(0);
      expect(unsandboxed.map((agent) => plainText(unsandboxedLine(agent).phrase))).toEqual([
        "Writer runs on this computer without the sandbox, as chosen on 9 Nov.",
      ]);
    });

    it("needs the sandbox again once the agent's file changed after the choice", async () => {
      const { machine, placement } = machineWith(bubblewrapMissing);
      await workspaceOf();
      await chooseThisComputer(placement);
      const pulled = await workspaceOf({ [writer]: `${writerFile}workingFolder: files/out\n` });

      await refusal(checkRunSandbox(pulled, supportReply, machine));
      expect(machine.checks).toBe(1);
    });

    it("doesn't carry a choice made on another computer over to this one", async () => {
      const workspace = await workspaceOf();
      const elsewhere = machineWith(bubblewrapMissing);
      await chooseThisComputer(elsewhere.placement);
      const here = machineWith(bubblewrapMissing);

      await refusal(checkRunSandbox(workspace, supportReply, here.machine));
    });
  });
});
