import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import type { QuestionTerminal } from "../../output/question.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { createTrustCommand, type TrustMachine } from "./command.ts";

/** The example `init --example acme` copies: only the test model, so it needs no trust. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

const line = "✓ Acme needs no trust: it reaches only the test model and starts nothing.";

let folder: string;
let store: FileTrustStore;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-trust-not-needed-"));
  store = new FileTrustStore(join(folder, "profile", "trust"));
  cpSync(acmeExample, join(folder, "acme"), { recursive: true });
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

/** A terminal on stdin where the user types `answers`, keeping what was written to stderr. */
function terminalTyping(...answers: string[]) {
  const written: string[] = [];
  const questions: QuestionTerminal = {
    write: (text) => written.push(text),
    readLine: async () => answers.shift(),
  };
  const terminal: Terminal = {
    env: { LANG: "en_US.UTF-8", NO_COLOR: "1" },
    platform: "linux",
    stdoutIsTerminal: true,
    stderrIsTerminal: true,
    questions,
  };
  return { terminal, written: () => written.join("") };
}

verifies("cli.commands.trust.review-and-trust", () => {
  it("says the example Acme needs no trust, asking nothing and saving nothing (HAL-6631)", async () => {
    const io = captureIo(folder);
    const { terminal, written } = terminalTyping("y", "y");

    const code = await runCli(["trust", "--dir", "acme"], io, commands(), { terminal });

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([line]);
    expect(io.stderr).toEqual([]);
    expect(written()).toBe("");
    expect(await store.list()).toEqual([]);
  });

  it("says the example Acme needs no trust without a terminal, with --yes --fingerprint and in --json", async () => {
    const fingerprint = `hfp1:${"0".repeat(64)}`;
    const piped = captureIo(folder);
    const scripted = captureIo(folder);
    const json = captureIo(folder);

    const codes = [
      await runCli(["trust", "--dir", "acme"], piped, commands()),
      await runCli(
        ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint],
        scripted,
        commands(),
      ),
      await runCli(["trust", "--dir", "acme", "--json"], json, commands()),
    ];

    expect(codes).toEqual([exitCode.ok, exitCode.ok, exitCode.ok]);
    expect(piped.stdout).toEqual([line]);
    expect(scripted.stdout).toEqual([line]);
    expect(JSON.parse(json.stdout.join("\n"))).toMatchObject({
      name: "Acme",
      folder: `.${sep}acme`,
      status: "not-needed",
    });
    expect([piped, scripted, json].flatMap((io) => io.stdout).join("\n")).not.toMatch(/hfp1:/u);
    expect(await store.list()).toEqual([]);
  });
});
