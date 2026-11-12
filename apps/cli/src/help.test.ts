import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { CliCommand } from "./command.ts";
import { commands as realCommands } from "./generated/commands.ts";
import { defineMessages } from "./messages/define.ts";
import { phrase } from "./messages/phrase.ts";
import { runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";

/** A command whose usage line and option description are each too long for one line. */
const longMessages = defineMessages("long", {
  summary: () => phrase`Do a long thing`,
  wait: () =>
    phrase`What to answer when the run waits for you, such as approve. One per wait, in order.`,
  short: () => phrase`Fits on one line.`,
});

const longCommand: CliCommand = {
  name: "long",
  usage: "<workflow> [--dir <folder>] [--input <file or JSON>] [--event <event>]... [--short]",
  summary: longMessages.summary(),
  action: () => longMessages.summary(),
  options: {
    event: { type: "string", valueName: "event", description: longMessages.wait() },
    short: { type: "boolean", description: longMessages.short() },
  },
};

/** The words of every real command and subcommand, such as "runs show". */
function realCommandWords(): string[] {
  return Object.values(realCommands).flatMap((command) => [
    command.name,
    ...(command.subcommands ?? []).map((subcommand) => `${command.name} ${subcommand.name}`),
  ]);
}

verifies("cli.help", () => {
  it("wraps a long usage line under its first argument, never inside an argument", async () => {
    const io = captureIo("/work");
    await runCli(["long", "--help"], io, [longCommand]);
    expect(io.stdout.slice(0, 2)).toEqual([
      "Usage: halonic long <workflow> [--dir <folder>] [--input <file or JSON>]",
      "                    [--event <event>]... [--short]",
    ]);
  });

  it("wraps a long option description under the description column, with the same words", async () => {
    const io = captureIo("/work");
    await runCli(["long", "--help"], io, [longCommand]);
    expect(io.stdout.slice(-3)).toEqual([
      "  --event <event>  What to answer when the run waits for you, such as approve.",
      "                   One per wait, in order.",
      "  --short          Fits on one line.",
    ]);
  });

  it.each(realCommandWords())(
    "keeps every line of the real halonic %s --help within 80 columns",
    async (words) => {
      const io = captureIo("/work");
      await runCli([...words.split(" "), "--help"], io, Object.values(realCommands));
      expect(io.stdout.length).toBeGreaterThan(0);
      for (const line of io.stdout) {
        expect(line.length, line).toBeLessThanOrEqual(80);
      }
    },
  );
});
