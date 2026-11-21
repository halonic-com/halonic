import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileInstructionTrustStore, FileTrustStore } from "@halonicjs/adapter-fs-node";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import type { QuestionTerminal } from "../../output/question.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { createTrustCommand, type TrustMachine } from "./command.ts";
import { createTrustInstructionsCommand, type InstructionTrustMachine } from "./instructions.ts";

let folder: string;
let instructionStore: FileInstructionTrustStore;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-trust-instructions-"));
  instructionStore = new FileInstructionTrustStore(join(folder, "profile", "instruction-trust"));
  writeFiles({
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/lab/hub.yaml": "id: lab\nname: Lab\n",
    "hubs/lab/agents/coder.agent.yaml":
      "id: coder\nname: Coder\nharness: claude-code\ninstructions: Write the change.\nskills: [review]\n",
    "hubs/lab/library/skills/review/SKILL.md": skill("Review the change."),
  });
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** A skill's file, with the front matter a skill needs. */
function skill(body: string): string {
  return `---\nname: Review\ndescription: Reviews a change.\n---\n${body}\n`;
}

/**
 * What is trusted for the coder in Acme, or `null`. Keyed by the real path
 * the command takes: on Windows only this `realpath` also expands short
 * folder names such as `RUNNER~1`, which `realpathSync` leaves.
 */
async function trustedForCoder() {
  return await instructionStore.get({
    location: await realpath(join(folder, "acme")),
    agent: "coder",
  });
}

function writeFiles(files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    const file = join(folder, "acme", path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

const clock = fixedClock(Date.UTC(2026, 10, 21, 12));

function workspaceMachine(): TrustMachine {
  return {
    store: new FileTrustStore(join(folder, "profile", "trust")),
    clock,
    commandSearch: { path: undefined, endings: [] },
  };
}

function instructionMachine(): InstructionTrustMachine {
  return { store: instructionStore, clock };
}

const commands = () => [
  createTrustCommand(workspaceMachine, {}, createTrustInstructionsCommand(instructionMachine)),
];

/** What the fake terminal's questions wrote, the lines shown before them included. */
let asked: string;

/** A terminal on stdin where the user types `answers`. */
function terminalTyping(...answers: string[]): Terminal {
  asked = "";
  const questions: QuestionTerminal = {
    write: (text) => {
      asked += text;
    },
    readLine: async () => answers.shift(),
  };
  return {
    env: { LANG: "en_US.UTF-8", NO_COLOR: "1" },
    platform: "linux",
    stdoutIsTerminal: true,
    stderrIsTerminal: true,
    questions,
  };
}

async function trustCoder(...args: string[]) {
  const io = captureIo(folder);
  const code = await runCli(
    ["trust", "instructions", "coder", "--dir", "acme", ...args],
    io,
    commands(),
  );
  return { code, io };
}

/** The fingerprint the refusal without a terminal prints last on stdout. */
async function currentFingerprint(): Promise<string> {
  const { io } = await trustCoder();
  return io.stdout.at(-1) ?? "";
}

verifies("cli.commands.trust.instructions", () => {
  describe("in a terminal", () => {
    it("shows the files and the fingerprint, and trusts them on yes", async () => {
      const io = captureIo(folder);
      const terminal = terminalTyping("y");

      const code = await runCli(
        ["trust", "instructions", "coder", "--dir", "acme"],
        io,
        commands(),
        { terminal },
      );

      expect(code).toBe(exitCode.ok);
      const shown = asked;
      expect(shown).toContain("Instructions of coder");
      expect(shown).toMatch(/^ +AGENTS\.md$/mu);
      expect(shown).toMatch(/^ +skills\/review\/SKILL\.md$/mu);
      expect(shown).toMatch(/^ +sha256:[0-9a-f]{64}$/mu);
      expect(io.stdout).toEqual(["✓ coder's instructions are trusted. It can run now."]);
      expect(await trustedForCoder()).not.toBeNull();
    });

    it("saves nothing on no", async () => {
      const io = captureIo(folder);

      const code = await runCli(
        ["trust", "instructions", "coder", "--dir", "acme"],
        io,
        commands(),
        { terminal: terminalTyping("n") },
      );

      expect(code).toBe(exitCode.notTrusted);
      expect(await trustedForCoder()).toBeNull();
    });

    it("tags what changed since they were trusted", async () => {
      await trustCoder("--yes", "--fingerprint", await currentFingerprint());
      writeFiles({ "hubs/lab/library/skills/review/SKILL.md": skill("Review it twice.") });
      const io = captureIo(folder);

      await runCli(["trust", "instructions", "coder", "--dir", "acme"], io, commands(), {
        terminal: terminalTyping("n"),
      });

      const shown = asked;
      expect(shown).toContain("These changed since you trusted them on this computer.");
      expect(shown).toMatch(/^ +Changed +skills\/review\/SKILL\.md$/mu);
      expect(shown).toMatch(/^ {4,}AGENTS\.md$/mu);
    });
  });

  describe("without a terminal", () => {
    it("refuses with the command that trusts what it showed, and saves nothing", async () => {
      const { code, io } = await trustCoder();

      expect(code).toBe(exitCode.notTrusted);
      const fingerprint = io.stdout.at(-1) ?? "";
      expect(fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(io.stderr).toContain(
        "✕ coder's instructions aren't trusted on this computer yet, and there's no terminal to ask you.",
      );
      expect(io.stderr).toContain(
        `  Read the list above, then run: halonic trust instructions coder --dir acme --yes --fingerprint ${fingerprint}`,
      );
      expect(await trustedForCoder()).toBeNull();
    });

    it("trusts with --yes and the current fingerprint, and then says nothing changed", async () => {
      const fingerprint = await currentFingerprint();

      const first = await trustCoder("--yes", "--fingerprint", fingerprint);
      const again = await trustCoder("--yes", "--fingerprint", fingerprint);

      expect(first.code).toBe(exitCode.ok);
      expect(first.io.stdout).toEqual(["✓ coder's instructions are trusted. It can run now."]);
      expect(again.io.stdout).toEqual([
        "✓ coder's instructions are already trusted on this computer. Nothing changed.",
      ]);
    });

    it("refuses a fingerprint from before a file changed", async () => {
      const old = await currentFingerprint();
      writeFiles({ "hubs/lab/library/skills/review/SKILL.md": skill("Review it twice.") });

      const { code, io } = await trustCoder("--yes", "--fingerprint", old);

      expect(code).toBe(exitCode.notTrusted);
      expect(io.stderr).toContain(
        "✕ That fingerprint doesn't match coder's instructions as they are now.",
      );
      expect(await trustedForCoder()).toBeNull();
    });

    it("refuses --yes alone as wrong usage, before reading anything", async () => {
      const { code, io } = await trustCoder("--yes");

      expect(code).toBe(exitCode.usage);
      expect(io.stderr[0]).toBe(
        "✕ --yes needs --fingerprint, so you trust exactly the instructions you reviewed.",
      );
      expect(await trustedForCoder()).toBeNull();
    });
  });

  it("names an agent the workspace doesn't have", async () => {
    const io = captureIo(folder);

    const code = await runCli(["trust", "instructions", "writer", "--dir", "acme"], io, commands());

    expect(code).toBe(exitCode.notFound);
    expect(io.stderr[0]).toBe("✕ There's no agent writer in this workspace.");
  });
});
