import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import type { QuestionTerminal } from "../../output/question.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { createTrustCommand, type TrustMachine } from "./command.ts";

let folder: string;
let store: FileTrustStore;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-trust-stray-word-"));
  store = new FileTrustStore(join(folder, "profile", "trust"));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** The trust records in the test's profile, a stopped clock, and no `PATH`. */
function machine(): TrustMachine {
  return {
    store,
    clock: fixedClock(Date.UTC(2026, 10, 3, 12)),
    commandSearch: { path: undefined, endings: [] },
  };
}

const commands = () => [createTrustCommand(machine)];

/** Writes Acme to `acme`, with one connector that starts `npx`, so it needs trust. */
function writeAcme(): void {
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "library/connectors/mail.connector.yaml":
      "name: Mail\ntransport:\n  stdio:\n    command: npx\n    args: ['@acme/mail-mcp']\ntools:\n  approve: []\n",
  };
  for (const [path, text] of Object.entries(files)) {
    const file = join(folder, "acme", path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

/** A terminal on stdin where the user types `answers`. */
function terminalTyping(...answers: string[]): Terminal {
  const questions: QuestionTerminal = {
    write: () => undefined,
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

verifies("cli.commands.trust.review-and-trust", () => {
  it("refuses a word such as revoke as wrong usage, keeping the trust (HAL-14124)", async () => {
    writeAcme();
    const terminal = terminalTyping("y", "y");
    expect(
      await runCli(["trust", "--dir", "acme"], captureIo(folder), commands(), { terminal }),
    ).toBe(exitCode.ok);
    const revoke = captureIo(folder);
    const other = captureIo(folder);

    const code = await runCli(["trust", "revoke", "--dir", "acme"], revoke, commands());
    const otherCode = await runCli(["trust", "acme"], other, commands());

    expect([code, otherCode]).toEqual([exitCode.usage, exitCode.usage]);
    expect(revoke.stdout).toEqual([]);
    expect(revoke.stderr).toEqual([
      "✕ halonic trust takes no arguments, and you gave revoke.",
      "  Did you mean --remove?",
    ]);
    expect(other.stderr).toEqual([
      "✕ halonic trust takes no arguments, and you gave acme.",
      "  To use the workspace in acme, run halonic trust --dir acme.",
    ]);
    expect(await store.list()).toHaveLength(1);
  });
});
