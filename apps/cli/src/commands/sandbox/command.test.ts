import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxRemoval, SandboxSetup } from "@halonicjs/adapter-sandbox-srt";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import type { QuestionTerminal } from "../../output/question.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { type SandboxSetter, sandboxCommandWith } from "./command.ts";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-sandbox-setup-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** Windows, where setup and remove answer `setup` and `removal` and count their calls. */
function windows(setup: SandboxSetup = { ok: true }, removal: SandboxRemoval = { ok: true }) {
  const calls = { setUp: 0, remove: 0 };
  const sandbox: SandboxSetter = {
    platform: "win32",
    setUp: async () => {
      calls.setUp++;
      return setup;
    },
    remove: async () => {
      calls.remove++;
      return removal;
    },
  };
  return { sandbox, calls };
}

/** A terminal on stdin where the user types `answers`, keeping what was written to stderr. */
function terminalTyping(...answers: string[]) {
  const written: string[] = [];
  const questions: QuestionTerminal = {
    write: (text) => written.push(text),
    readLine: async () => answers.shift(),
  };
  const terminal: Terminal = {
    env: { LANG: "en_US.UTF-8", NO_COLOR: "1" },
    // The terminal's marks, not the sandbox's system: a Windows console may not be UTF-8.
    platform: "linux",
    stdoutIsTerminal: true,
    stderrIsTerminal: true,
    questions,
  };
  return { terminal, written: () => written.join("") };
}

async function sandboxCli(sandbox: SandboxSetter, args: readonly string[], terminal?: Terminal) {
  const io = captureIo(folder);
  const code = await runCli(["sandbox", ...args], io, [sandboxCommandWith(() => sandbox)], {
    ...(terminal === undefined ? {} : { terminal }),
  });
  return { code, io };
}

verifies("cli.commands.sandbox.setup", () => {
  it("asks first, then sets the sandbox up and says both steps passed", async () => {
    const { sandbox, calls } = windows();
    const { terminal, written } = terminalTyping("y");
    const { code, io } = await sandboxCli(sandbox, ["setup"], terminal);
    expect(written()).toBe(
      "Set up the agent sandbox? Windows asks for administrator rights once. [y/N] ",
    );
    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Set up the agent sandbox", "✓ Checked the agent sandbox"]);
    expect(calls.setUp).toBe(1);
  });

  it("sets nothing up on No, and exits 1", async () => {
    const { sandbox, calls } = windows();
    const { code, io } = await sandboxCli(sandbox, ["setup"], terminalTyping("n").terminal);
    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual(["Not set up. Nothing changed."]);
    expect(calls.setUp).toBe(0);
  });

  it("asks nothing with --yes, and prints one JSON document with the outcome", async () => {
    const { sandbox } = windows();
    const { code, io } = await sandboxCli(sandbox, ["setup", "--yes", "--json"]);
    expect(code).toBe(exitCode.ok);
    expect(JSON.parse(io.stdout.join("\n"))).toMatchObject({ ok: true, outcome: "ready" });
  });

  it("refuses with exit 2, before any prompt, when there's no terminal and no --yes", async () => {
    const { sandbox, calls } = windows();
    const { code, io } = await sandboxCli(sandbox, ["setup"]);
    expect(code).toBe(exitCode.usage);
    expect(io.stderr.join("\n")).toContain("there's no terminal to ask you first.");
    expect(io.stderr.join("\n")).toContain("To go ahead anyway, pass --yes.");
    expect(calls.setUp).toBe(0);
  });

  it("words a turned-down prompt as the cancelled outcome", async () => {
    const cancelled = {
      ok: false,
      outcome: "cancelled",
      reason: "the administrator prompt was cancelled; nothing changed",
    } as const;
    const { code, io } = await sandboxCli(windows(cancelled).sandbox, ["setup", "--yes"]);
    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual([
      "! The sandbox isn't set up: Windows didn't give Halonic administrator rights. If you don't have an administrator password, ask whoever manages this computer.",
    ]);
  });

  it("gives a failed setup's reason as a sentence, with the helper's code after it", async () => {
    const failed = {
      ok: false,
      outcome: "failed",
      reason: "Windows didn't accept the sandbox's network rules",
      code: 12,
    } as const;
    const { code, io } = await sandboxCli(windows(failed).sandbox, ["setup", "--yes"]);
    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual([
      "! The sandbox isn't set up: Windows didn't accept the sandbox's network rules. Code 12",
    ]);
    const json = await sandboxCli(windows(failed).sandbox, ["setup", "--yes", "--json"]);
    expect(JSON.parse(json.io.stdout.join("\n"))).toMatchObject({
      ok: false,
      outcome: "failed",
      reason: "Windows didn't accept the sandbox's network rules",
      code: 12,
    });
  });

  it("says the setup passed but the check didn't", async () => {
    const checkFailed = {
      ok: false,
      outcome: "check_failed",
      reason: "the sandbox account is disabled",
    } as const;
    const { code, io } = await sandboxCli(windows(checkFailed).sandbox, ["setup", "--yes"]);
    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual([
      "✓ Set up the agent sandbox",
      "! The sandbox was set up, but didn't pass its check: the sandbox account is disabled.",
    ]);
  });

  it("asks nothing and changes nothing on Linux and macOS", async () => {
    const { sandbox, calls } = windows();
    const linux = { ...sandbox, platform: "linux" as const };
    const { code, io } = await sandboxCli(linux, ["setup"]);
    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "Only Windows needs this setup. To see whether the sandbox works on this computer, run halonic doctor.",
    ]);
    expect(calls.setUp).toBe(0);
  });
});

verifies("cli.commands.sandbox.remove", () => {
  it("asks first, then removes the sandbox", async () => {
    const { sandbox, calls } = windows();
    const { terminal, written } = terminalTyping("y");
    const { code, io } = await sandboxCli(sandbox, ["remove"], terminal);
    expect(written()).toBe(
      "Remove the agent sandbox? Agents set to run in a sandbox won't start until you set it up again. Windows asks for administrator rights once. [y/N] ",
    );
    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Removed the agent sandbox"]);
    expect(calls.remove).toBe(1);
  });

  it("removes nothing on No", async () => {
    const { sandbox, calls } = windows();
    const { code, io } = await sandboxCli(sandbox, ["remove"], terminalTyping("").terminal);
    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual(["Not removed. The sandbox is still set up."]);
    expect(calls.remove).toBe(0);
  });

  it("words a turned-down prompt and any other failure", async () => {
    const cancelled = { ok: false, outcome: "cancelled", reason: "cancelled" } as const;
    const refused = await sandboxCli(windows(undefined, cancelled).sandbox, ["remove", "--yes"]);
    expect(refused.io.stdout).toEqual([
      "! The sandbox wasn't removed: Windows didn't give Halonic administrator rights.",
    ]);
    const failed = {
      ok: false,
      outcome: "failed",
      reason: "a sandboxed program is running",
    } as const;
    const { code, io } = await sandboxCli(windows(undefined, failed).sandbox, [
      "remove",
      "--yes",
      "--json",
    ]);
    expect(code).toBe(exitCode.failed);
    expect(JSON.parse(io.stdout.join("\n"))).toMatchObject({
      outcome: "failed",
      reason: "a sandboxed program is running",
    });
  });
});
