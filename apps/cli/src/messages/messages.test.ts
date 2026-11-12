import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { paintFor } from "../output/paint.ts";
import { defineMessages } from "./define.ts";
import { errorMessages, usageMessages } from "./general.ts";
import { helpMessages } from "./help.ts";
import { bold, dim, markPart, phrase, plainText, renderPhrase } from "./phrase.ts";

const coloured = paintFor({ colour: true, live: true, unicode: true });
const piped = paintFor({ colour: false, live: false, unicode: true });
const oldConsole = paintFor({ colour: false, live: false, unicode: false });
// Built from a string, because Biome refuses a control character in a regular expression literal.
const escapeCode = new RegExp(`${"\u001b"}\\[\\d+m`, "g");

verifies("cli.messages", () => {
  it("keys each sentence by its area and name", () => {
    const message = usageMessages.unknownCommand("deploy");
    expect(message.key).toBe("usage.unknownCommand");
    expect(plainText(message.phrase)).toBe('There\'s no command "deploy".');
  });

  it("keeps the same words with colour, through a pipe and as JSON text", () => {
    const sentence = phrase`Set HALONIC_SECRET_OPENAI_KEY to a key ${bold("OpenAI")} accepts, then run again. ${dim("(key-refused)")}`;
    const words =
      "Set HALONIC_SECRET_OPENAI_KEY to a key OpenAI accepts, then run again. (key-refused)";
    expect(plainText(sentence)).toBe(words);
    expect(renderPhrase(sentence, piped)).toBe(words);
    const inTerminal = renderPhrase(sentence, coloured);
    expect(inTerminal).not.toBe(words);
    // Taking the escape codes out of the terminal's text leaves the same words.
    expect(inTerminal.replaceAll(escapeCode, "")).toBe(words);
  });

  it("makes the exit codes of the help as the design's four lines, each under 80 columns", () => {
    const lines = ([0, 1, 2, 3] as const).map((line) =>
      plainText(helpMessages.exitCodes(line).phrase),
    );
    expect(lines).toEqual([
      "Exit codes: 0 worked · 1 failed or found errors · 2 wrong usage or input ·",
      "3 not trusted · 4 not found · 5 conflict · 6 signed out · 7 not allowed ·",
      "8 limit reached · 9 didn't answer or the sandbox can't start ·",
      "130 or 143 stopped",
    ]);
    for (const line of lines) expect(line.length).toBeLessThan(80);
  });
});

describe("phrase", () => {
  it("joins plain text and numbers into one part, and keeps nested phrases' parts", () => {
    const inner = phrase`in ${dim("./acme")}`;
    expect(phrase`Checked ${14} files ${inner}.`).toEqual([
      "Checked 14 files in ",
      dim("./acme"),
      ".",
    ]);
  });

  it("writes the marks' stand-ins for a stream that isn't UTF-8, but keeps them in JSON text", () => {
    const sentence = phrase`Settings ${markPart("studioPath")} Agent sandbox`;
    expect(renderPhrase(sentence, oldConsole)).toBe("Settings > Agent sandbox");
    expect(plainText(sentence)).toBe("Settings › Agent sandbox");
  });
});

describe("defineMessages", () => {
  it("passes each entry's facts through to its sentence", () => {
    const schema = defineMessages("schema", {
      wrote: (count: number, folder: string) => phrase`Wrote ${count} JSON Schemas to ${folder}.`,
    });
    expect(plainText(schema.wrote(12, "./schemas").phrase)).toBe(
      "Wrote 12 JSON Schemas to ./schemas.",
    );
  });
});

describe("the general sentences", () => {
  it("frames line 1 with the action and the error's own reason", () => {
    const action = phrase`run ${bold("support-reply")}`;
    const reason = "Halonic couldn't reach Ollama at localhost:11434.";
    expect(plainText(errorMessages.couldnt(action, reason).phrase)).toBe(
      "Couldn't run support-reply: Halonic couldn't reach Ollama at localhost:11434.",
    );
  });

  it("dims the whole line with the docs link and the code", () => {
    const more = errorMessages.more(
      "https://docs.halonic.dev/sandbox#bubblewrap",
      "bubblewrap-missing",
    );
    expect(renderPhrase(more.phrase, piped)).toBe(
      "More: https://docs.halonic.dev/sandbox#bubblewrap (bubblewrap-missing)",
    );
    expect(renderPhrase(more.phrase, coloured)).toBe(
      "\u001b[2mMore: https://docs.halonic.dev/sandbox#bubblewrap (bubblewrap-missing)\u001b[22m",
    );
  });

  it("offers a near command or option only through its own sentence", () => {
    expect(plainText(usageMessages.unknownCommandNear("tset", "test").phrase)).toBe(
      'There\'s no command "tset". Did you mean test?',
    );
    expect(plainText(usageMessages.unknownOptionNear("--colour", "--no-color").phrase)).toBe(
      "There's no option --colour. Did you mean --no-color?",
    );
  });

  it("has the help's own lines word for word from cli-output 1.9", () => {
    const words = (message: { phrase: Parameters<typeof plainText>[0] }) =>
      plainText(message.phrase);
    expect([
      words(helpMessages.tagline()),
      words(helpMessages.usage()),
      words(helpMessages.commandsHeading()),
      words(helpMessages.globalOptions(["--json", "--no-color", "--verbose", "--debug", "--help"])),
      words(helpMessages.commandHelpHint()),
    ]).toEqual([
      "Run and check Halonic workspaces from the command line.",
      "Usage: halonic <command> [arguments]",
      "Commands:",
      "Options for every command: --json, --no-color, --verbose, --debug, --help",
      "Run halonic <command> --help for a command's arguments and options.",
    ]);
    expect(words(helpMessages.commandUsage("schema", "[folder]"))).toBe(
      "Usage: halonic schema [folder]",
    );
    expect(words(helpMessages.commandUsage("doctor", ""))).toBe("Usage: halonic doctor");
    expect(words(helpMessages.optionsHeading())).toBe("Options:");
  });

  it("has a bug's two lines as approved, with and without the command's action", () => {
    const reason = plainText(errorMessages.internal().phrase);
    const fix = plainText(errorMessages.internalFix().phrase);
    const action = phrase`run ${bold("support-reply")}`;
    expect(plainText(errorMessages.couldnt(action, reason).phrase)).toBe(
      "Couldn't run support-reply: Halonic ran into a problem it can't explain yet.",
    );
    expect(reason).toBe("Halonic ran into a problem it can't explain yet.");
    expect(fix).toBe(
      "Run it again with --debug to see the details, and report it: https://github.com/halonic-com/halonic/issues",
    );
  });

  it("has the wrong-usage lines", () => {
    const words = (message: { phrase: Parameters<typeof plainText>[0] }) =>
      plainText(message.phrase);
    expect(words(usageMessages.seeEveryCommand())).toBe("Run halonic --help to see every command.");
    expect(words(usageMessages.unknownOption("--colour"))).toBe("There's no option --colour.");
    expect(words(usageMessages.seeCommandOptions("test"))).toBe(
      "Run halonic test --help to see its options.",
    );
    expect(words(usageMessages.missingValue("--dir", "folder"))).toBe(
      "--dir needs a value: --dir <folder>.",
    );
    expect(words(usageMessages.noValueWanted("--json", "--json=yes"))).toBe(
      "--json doesn't take a value, and you gave one: --json=yes.",
    );
  });
});
