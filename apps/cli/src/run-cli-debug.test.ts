import type { Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { CliCommand } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { defineMessages } from "./messages/define.ts";
import { phrase } from "./messages/phrase.ts";
import { runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";
import { manualClock } from "./test/manual-clock.ts";

const retryMessages = defineMessages("retry", {
  summary: () => phrase`Draft a reply, retrying a timer once`,
  draftReply: () => phrase`Draft a reply`,
  timerRetried: (reason: string) =>
    phrase`timer of step Draft a reply failed, try 2 of 3: ${reason}`,
  drafted: () => phrase`Drafted the reply.`,
});

// A made-up value, not shaped like any real key.
const apiKey = "made-up-key-42";
const secrets: Secrets = { get: async (name) => (name === "provider-key" ? apiKey : null) };

/** A command whose timer fails once, quoting the key it loaded, and then drafts the reply. */
function retryingCommand(clock = manualClock()): CliCommand {
  return {
    name: "draft",
    usage: "",
    summary: retryMessages.summary(),
    options: {},
    async run(_input, context) {
      const key = await context.secrets.get("provider-key");
      const progress = context.progress(retryMessages.draftReply().phrase);
      clock.advance(1_500);
      context.debug(retryMessages.timerRetried(`refused ${key}`).phrase);
      progress.end();
      return {
        exitCode: exitCode.ok,
        lines: [retryMessages.drafted().phrase],
        json: { drafted: true },
      };
    },
  };
}

verifies("cli.debug-lines", () => {
  it("writes a debug line to stderr with --debug, scrubbed, and leaves stdout as it was", async () => {
    const io = captureIo("/work");

    const code = await runCli(["draft", "--debug"], io, [retryingCommand()], { secrets });

    expect(code).toBe(exitCode.ok);
    expect(io.stderr).toEqual([
      "timer of step Draft a reply failed, try 2 of 3: refused [secret removed]",
    ]);
    expect(io.stdout).toEqual(["Drafted the reply."]);
  });

  it("writes nothing for a debug line without --debug", async () => {
    const io = captureIo("/work");

    await runCli(["draft"], io, [retryingCommand()], { secrets });

    expect(io.stderr).toEqual([]);
    expect(io.stdout).toEqual(["Drafted the reply."]);
  });

  it("keeps stdout one document with --json --debug, and the debug line on stderr", async () => {
    const io = captureIo("/work");

    await runCli(["draft", "--json", "--debug"], io, [retryingCommand()], { secrets });

    expect(io.stderr).toEqual([
      "timer of step Draft a reply failed, try 2 of 3: refused [secret removed]",
    ]);
    expect(io.stdout).toHaveLength(1);
    expect(JSON.parse(io.stdout.join(""))).toMatchObject({ ok: true, drafted: true });
  });

  it("writes it above the live line, which is drawn again below it", async () => {
    const clock = manualClock();
    const seen: string[] = [];
    const show = (text: string) => text.replaceAll("\r\u001b[2K", "(erase)");
    const io = {
      cwd: "/work",
      out: (line: string) => seen.push(`out ${show(line)}`),
      err: (line: string) => seen.push(`err ${show(line)}`),
    };

    await runCli(["draft", "--debug"], io, [retryingCommand(clock)], {
      secrets,
      clock,
      terminal: {
        env: { LANG: "en_US.UTF-8", NO_COLOR: "1" },
        platform: "linux",
        stdoutIsTerminal: true,
        stderrIsTerminal: true,
        stderr: { write: (text) => seen.push(`live ${show(text)}`), columns: () => 80 },
      },
    });

    expect(seen).toEqual([
      "live (erase)◌ Draft a reply",
      "live (erase)",
      "err timer of step Draft a reply failed, try 2 of 3: refused [secret removed]",
      "live (erase)◌ Draft a reply",
      "live (erase)",
      "out Drafted the reply.",
    ]);
  });
});
