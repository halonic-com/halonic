import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type CliCommand, UsageError } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { defineMessages } from "./messages/define.ts";
import { bold, markPart, phrase } from "./messages/phrase.ts";
import { pluginMessages } from "./messages/plugin.ts";
import { trustMessages } from "./messages/trust.ts";
import { NotTrustedError } from "./not-trusted.ts";
import type { QuestionTerminal } from "./output/question.ts";
import { runCli, type Terminal } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";
import { manualClock } from "./test/manual-clock.ts";

const testMessages = defineMessages("test", {
  summary: () => phrase`Trust a workspace`,
  heading: () => phrase`Trust check for ${bold("Acme")} (./acme)`,
  trustAcme: () => phrase`Trust ${bold("Acme")} on this computer?`,
  notPinned: () => phrase`mail-mcp isn't pinned. Trust it anyway?`,
  trusted: () => phrase`${markPart("done")} Trusted Acme.`,
  notTrusted: () => phrase`Left Acme untrusted.`,
  checking: () => phrase`Check Acme`,
});

/** `trust`'s refusal without a terminal: the reason, then the flags, and exit 3 (F6). */
const notTrusted = () =>
  new NotTrustedError({
    problem: trustMessages.noTerminal("Acme"),
    fix: trustMessages.noTerminalFix("./acme"),
    fingerprint: `hfp1:${"0".repeat(64)}`,
    check: [],
  });

/** `plugin remove`'s refusal without a terminal: wrong usage, so exit 2 (F6). */
const removeRefused = () =>
  new UsageError(pluginMessages.removeNoTerminal("mail-mcp"), pluginMessages.removeNoTerminalFix());

/** A command shaped like `halonic trust`: the check, then two questions that both need a yes. */
const trustCommand: CliCommand = {
  name: "trust",
  usage: "[--yes]",
  summary: testMessages.summary(),
  options: {},
  async run(_input, context) {
    const trusted =
      (await context.ask({
        question: testMessages.trustAcme(),
        shownFirst: [testMessages.heading().phrase],
        yes: false,
        refusal: notTrusted,
      })) &&
      (await context.ask({ question: testMessages.notPinned(), yes: false, refusal: notTrusted }));
    const line = trusted ? testMessages.trusted() : testMessages.notTrusted();
    return { exitCode: exitCode.ok, lines: [line.phrase], json: { trusted } };
  },
};

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
  return { terminal, written };
}

verifies("cli.questions", () => {
  it("asks two questions in one run, the first after the lines it shows first", async () => {
    const io = captureIo("/work");
    const { terminal, written } = terminalTyping("y", "yes");
    expect(await runCli(["trust"], io, [trustCommand], { terminal })).toBe(exitCode.ok);
    expect(written).toEqual([
      "Trust check for Acme (./acme)\n",
      "Trust Acme on this computer? [y/N] ",
      "mail-mcp isn't pinned. Trust it anyway? [y/N] ",
    ]);
    expect(io.stdout).toEqual(["✓ Trusted Acme."]);
  });

  it("takes a no to the second question as no", async () => {
    const io = captureIo("/work");
    const { terminal } = terminalTyping("y", "");
    await runCli(["trust"], io, [trustCommand], { terminal });
    expect(io.stdout).toEqual(["Left Acme untrusted."]);
  });

  it("asks nothing and refuses with --json, in CI or without a terminal on stdin", async () => {
    const cases = [
      { args: ["trust", "--json"], env: {} },
      { args: ["trust"], env: { CI: "true" } },
    ];
    for (const { args, env } of cases) {
      const io = captureIo("/work");
      const { terminal, written } = terminalTyping("y", "y");
      const inCi = { ...terminal, env: { ...terminal.env, ...env } };
      expect(await runCli(args, io, [trustCommand], { terminal: inCi })).toBe(exitCode.notTrusted);
      expect(written).toEqual([]);
    }
    const io = captureIo("/work");
    expect(await runCli(["trust"], io, [trustCommand])).toBe(exitCode.notTrusted);
    expect(io.stderr.slice(0, 2)).toEqual([
      "✕ Acme isn't trusted on this computer yet, and there's no terminal to ask you.",
      "  Review it with halonic trust --dir ./acme, then pass --yes --fingerprint <fingerprint>.",
    ]);
  });

  it("refuses plugin remove without a terminal as wrong usage, in two lines", async () => {
    const removeCommand: CliCommand = {
      ...trustCommand,
      name: "remove",
      async run(_input, context) {
        const removed = await context.ask({
          question: testMessages.trustAcme(),
          yes: false,
          refusal: removeRefused,
        });
        return { exitCode: exitCode.ok, lines: [], json: { removed } };
      },
    };
    const io = captureIo("/work");
    expect(await runCli(["remove"], io, [removeCommand])).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      "✕ Removing mail-mcp deletes its settings and secrets, and there's no terminal to ask you.",
      "  To remove it anyway, pass --yes.",
    ]);
  });

  it("takes the live line away before asking", async () => {
    const clock = manualClock();
    const seen: string[] = [];
    const show = (text: string) => text.replaceAll("\r\u001b[2K", "(erase)");
    const askingCommand: CliCommand = {
      ...trustCommand,
      async run(_input, context) {
        context.progress(testMessages.checking().phrase);
        clock.advance(1_500);
        const trusted = await context.ask({
          question: testMessages.trustAcme(),
          yes: false,
          refusal: notTrusted,
        });
        return { exitCode: exitCode.ok, lines: [], json: { trusted } };
      },
    };
    const { terminal } = terminalTyping();
    const screen: Terminal = {
      ...terminal,
      stderr: { write: (text) => seen.push(`live ${show(text)}`), columns: () => 80 },
      questions: { write: (text) => seen.push(`ask ${text}`), readLine: async () => "y" },
    };
    await runCli(["trust"], captureIo("/work"), [askingCommand], { terminal: screen, clock });
    expect(seen.slice(0, 3)).toEqual([
      "live (erase)◌ Check Acme",
      "live (erase)",
      "ask Trust Acme on this computer? [y/N] ",
    ]);
  });
});
