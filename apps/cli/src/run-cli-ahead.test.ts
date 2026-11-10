import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { CliCommand, CommandContext } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { defineMessages } from "./messages/define.ts";
import { type Phrase, phrase } from "./messages/phrase.ts";
import { takePrintAheadMismatches } from "./output/printed-ahead.ts";
import { runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";
import { manualClock } from "./test/manual-clock.ts";
import { failOnPrintAheadMismatch } from "./test/print-ahead-check.spec.ts";

const stepMessages = defineMessages("steps", {
  summary: () => phrase`Run three steps`,
  classify: () => phrase`✓ Classify it`,
  draft: () => phrase`✓ Draft a reply`,
  draftReply: () => phrase`Draft a reply`,
  done: () => phrase`Done.`,
});

const classify = stepMessages.classify().phrase;
const draft = stepMessages.draft().phrase;
const done = stepMessages.done().phrase;

/**
 * A command that prints `ahead` while it runs, each after the one before,
 * notes what stdout held when it printed the last, and returns `lines`.
 */
function stepsCommand(ahead: readonly Phrase[], lines: readonly Phrase[]) {
  const seen = { stdoutBeforeReturn: [] as string[] };
  const command = (stdout: readonly string[]): CliCommand => ({
    name: "steps",
    usage: "",
    summary: stepMessages.summary(),
    options: {},
    async run(_input, context: CommandContext) {
      for (const line of ahead) context.printAhead(line);
      seen.stdoutBeforeReturn = [...stdout];
      return { exitCode: exitCode.ok, lines, json: { steps: lines.length } };
    },
  });
  return { seen, command };
}

verifies("cli.print-ahead", () => {
  it("prints a line ahead at once through a pipe, and stdout ends the same as without it", async () => {
    const io = captureIo("/work");
    const { seen, command } = stepsCommand([classify, draft], [classify, draft, done]);

    const code = await runCli(["steps"], io, [command(io.stdout)]);

    expect(code).toBe(exitCode.ok);
    expect(seen.stdoutBeforeReturn).toEqual(["✓ Classify it", "✓ Draft a reply"]);
    expect(io.stdout).toEqual(["✓ Classify it", "✓ Draft a reply", "Done."]);
  });

  it("prints nothing ahead with --json, and the document holds the whole result", async () => {
    const io = captureIo("/work");
    const { seen, command } = stepsCommand([classify], [classify, done]);

    await runCli(["steps", "--json"], io, [command(io.stdout)]);

    expect(seen.stdoutBeforeReturn).toEqual([]);
    expect(io.stdout).toHaveLength(1);
    expect(JSON.parse(io.stdout.join(""))).toMatchObject({ ok: true, steps: 2 });
  });

  it("prints the whole result when the lines printed ahead don't start it", async () => {
    const io = captureIo("/work");
    const { command } = stepsCommand([draft], [classify, draft, done]);

    await runCli(["steps"], io, [command(io.stdout)]);

    // A line twice beats a line lost; the CLI's tests fail on the mismatch.
    expect(io.stdout).toEqual(["✓ Draft a reply", "✓ Classify it", "✓ Draft a reply", "Done."]);
    expect(takePrintAheadMismatches()).toEqual([
      { printed: [draft], result: [classify, draft, done] },
    ]);
  });

  it("fails the test a mismatch happened in", async () => {
    const io = captureIo("/work");
    const { command } = stepsCommand([done], [classify, done]);

    await runCli(["steps"], io, [command(io.stdout)]);

    expect(failOnPrintAheadMismatch).toThrow(
      "A command printed lines ahead that aren't the first lines of its result.\n" +
        "Printed ahead:\n  Done.\nResult:\n  ✓ Classify it\n  Done.",
    );
    expect(failOnPrintAheadMismatch).not.toThrow();
  });

  it("prints a line ahead above the live line, which is drawn again below it", async () => {
    const clock = manualClock();
    const seen: string[] = [];
    const show = (text: string) => text.replaceAll("\r\u001b[2K", "(erase)");
    const io = {
      cwd: "/work",
      out: (line: string) => seen.push(`out ${show(line)}`),
      err: (line: string) => seen.push(`err ${show(line)}`),
    };
    const command: CliCommand = {
      ...stepsCommand([], []).command([]),
      async run(_input, context) {
        const progress = context.progress(stepMessages.draftReply().phrase);
        clock.advance(1_500);
        context.printAhead(classify);
        progress.end();
        return { exitCode: exitCode.ok, lines: [classify, done], json: {} };
      },
    };

    await runCli(["steps"], io, [command], {
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
      "out ✓ Classify it",
      "live (erase)◌ Draft a reply",
      "live (erase)",
      "out Done.",
    ]);
  });
});
