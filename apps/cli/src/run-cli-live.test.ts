import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { CliCommand } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { defineMessages } from "./messages/define.ts";
import { phrase } from "./messages/phrase.ts";
import { runCli, type Terminal } from "./run-cli.ts";
import { fakeSignals } from "./test/fake-signals.ts";
import { manualClock } from "./test/manual-clock.ts";

const draftMessages = defineMessages("draft", {
  summary: () => phrase`Draft a reply`,
  draftReply: () => phrase`Draft a reply`,
  drafted: () => phrase`Drafted the reply.`,
});

/** Everything that reached one terminal screen, in order, with the erase code shown as "(erase)". */
function terminalScreen() {
  const seen: string[] = [];
  const show = (text: string) => text.replaceAll("\r\u001b[2K", "(erase)");
  return {
    seen,
    io: {
      cwd: "/work",
      out: (line: string) => seen.push(`out ${show(line)}`),
      err: (line: string) => seen.push(`err ${show(line)}`),
    },
    stderr: { write: (text: string) => seen.push(`live ${show(text)}`), columns: () => 80 },
  };
}

/**
 * A step that runs for 1.5 seconds, so its live line shows, and returns
 * without ending it, as a command with a bug would.
 */
function draftCommand(clock: ReturnType<typeof manualClock>): CliCommand {
  return {
    name: "draft",
    usage: "",
    summary: draftMessages.summary(),
    options: {},
    async run(_input, context) {
      context.progress(draftMessages.draftReply().phrase);
      clock.advance(1_500);
      return { exitCode: exitCode.ok, lines: [draftMessages.drafted().phrase], json: {} };
    },
  };
}

function terminalWith(screen: ReturnType<typeof terminalScreen>, env = {}): Terminal {
  return {
    env: { LANG: "en_US.UTF-8", NO_COLOR: "1", ...env },
    platform: "linux",
    stdoutIsTerminal: true,
    stderrIsTerminal: true,
    stderr: screen.stderr,
  };
}

verifies("cli.progress", () => {
  it("writes a result above the live line and takes the line away when the command ends", async () => {
    const clock = manualClock();
    const screen = terminalScreen();
    const terminal = terminalWith(screen);
    await runCli(["draft"], screen.io, [draftCommand(clock)], { terminal, clock });
    expect(screen.seen).toEqual([
      "live (erase)◌ Draft a reply",
      "live (erase)",
      "out Drafted the reply.",
      "live (erase)◌ Draft a reply",
      "live (erase)",
    ]);
  });

  it("draws no live line with --json or in CI", async () => {
    for (const [args, env] of [
      [["draft", "--json"], {}],
      [["draft"], { CI: "true" }],
    ] as const) {
      const clock = manualClock();
      const screen = terminalScreen();
      const terminal = terminalWith(screen, env);
      await runCli(args, screen.io, [draftCommand(clock)], { terminal, clock });
      expect(screen.seen.filter((entry) => entry.startsWith("live"))).toEqual([]);
    }
  });
});

verifies("cli.stop", () => {
  it("clears the live line before Stopped., and never draws it again", async () => {
    const clock = manualClock();
    const screen = terminalScreen();
    const signals = fakeSignals();
    const stoppable: CliCommand = {
      ...draftCommand(clock),
      async run(_input, context) {
        context.progress(draftMessages.draftReply().phrase);
        clock.advance(1_500);
        signals.send("SIGINT");
        clock.advance(1_000);
        return { stopped: true, json: {} };
      },
    };
    const code = await runCli(["draft"], screen.io, [stoppable], {
      terminal: terminalWith(screen),
      clock,
      stop: { signals, exitNow: () => {} },
    });
    expect(code).toBe(130);
    expect(screen.seen).toEqual(["live (erase)◌ Draft a reply", "live (erase)", "err Stopped."]);
  });
});
