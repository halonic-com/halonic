import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type CliCommand, UsageError } from "./command.ts";
import { exitCode, exitCodeMeanings } from "./exit-code.ts";
import { runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";

/** An error class with its own kind and fix, as an existing error class gets them. */
class NotHereError extends Error {
  readonly kind = "not_found";
  readonly fix = "Greet someone who is here, such as Ada.";
}

/** A command that greets, to drive the CLI without touching any files. */
const greetCommand: CliCommand = {
  name: "greet",
  usage: "<name> [--loud]",
  summary: "Say hello.",
  options: {
    loud: { type: "boolean", description: "Shout it." },
    from: { type: "string", valueName: "who", description: "Who says it." },
  },
  async run(input, io) {
    const [name] = input.positionals;
    if (name === undefined) {
      throw new UsageError("Say who to greet.");
    }
    if (name === "nobody") {
      throw new Error("nobody is there");
    }
    if (name === "a ghost") {
      throw "boo";
    }
    if (name === "the moon") {
      throw new NotHereError("The moon isn't here.");
    }
    io.out(input.options["loud"] === true ? `HELLO ${name.toUpperCase()}` : `Hello ${name}`);
    return exitCode.ok;
  },
};

const trustCommand: CliCommand = {
  name: "trust-me",
  usage: "",
  summary: "Refuse, as an untrusted workspace does.",
  options: {},
  run: async () => exitCode.notTrusted,
};

const commands = [greetCommand, trustCommand];

/** What the CLI prints for an error without a kind, instead of its text. */
const internalLines = [
  "✕ Halonic ran into a problem it can't explain yet.",
  "  Run it again with --debug to see the details, and report it: https://github.com/halonic-com/halonic/issues",
];

describe("runCli", () => {
  it("runs the named command with its arguments and options", async () => {
    const io = captureIo("/work");
    expect(await runCli(["greet", "Ada", "--loud"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["HELLO ADA"]);
    expect(io.stderr).toEqual([]);
  });
});

verifies("cli.exit-codes", () => {
  it("keeps the meaning of each exit code", () => {
    expect(exitCode).toEqual({
      ok: 0,
      failed: 1,
      usage: 2,
      notTrusted: 3,
      notFound: 4,
      conflict: 5,
      unauthenticated: 6,
      denied: 7,
      limitReached: 8,
      unavailable: 9,
    });
  });

  it("prints a usage error with the usage line and exits with 2", async () => {
    const io = captureIo("/work");
    expect(await runCli(["greet"], io, commands)).toBe(exitCode.usage);
    expect(io.stderr).toEqual(["✕ Say who to greet.", "  Usage: halonic greet <name> [--loud]"]);
  });

  it("treats an unknown option or a missing value as a usage error", async () => {
    const unknown = captureIo("/work");
    expect(await runCli(["greet", "Ada", "--colour"], unknown, commands)).toBe(exitCode.usage);
    expect(unknown.stderr[0]).toContain("--colour");
    const noValue = captureIo("/work");
    expect(await runCli(["greet", "Ada", "--from"], noValue, commands)).toBe(exitCode.usage);
    expect(noValue.stderr[0]).toContain("--from");
  });

  it("ends a failure without a kind with 1, and never shows its text", async () => {
    const io = captureIo("/work");
    expect(await runCli(["greet", "nobody"], io, commands)).toBe(exitCode.failed);
    expect(io.stderr).toEqual(internalLines);
    const thrownText = captureIo("/work");
    expect(await runCli(["greet", "a ghost"], thrownText, commands)).toBe(exitCode.failed);
    expect(thrownText.stderr).toEqual(internalLines);
  });

  it("ends a failure with the exit code of its kind and prints its fix", async () => {
    const io = captureIo("/work");
    expect(await runCli(["greet", "the moon"], io, commands)).toBe(exitCode.notFound);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual([
      "✕ The moon isn't here.",
      "  Greet someone who is here, such as Ada.",
    ]);
  });

  it("adds the error's own text after its lines with --debug, before or after the command", async () => {
    for (const args of [
      ["--debug", "greet", "nobody"],
      ["greet", "nobody", "--debug"],
    ]) {
      const io = captureIo("/work");
      expect(await runCli(args, io, commands)).toBe(exitCode.failed);
      expect(io.stderr.slice(0, 3)).toEqual([...internalLines, "Error: nobody is there"]);
    }
  });

  it("gives a command --debug as an argument after --", async () => {
    const io = captureIo("/work");
    expect(await runCli(["greet", "--", "--debug"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["Hello --debug"]);
  });

  it("passes on the code a command returns, such as 3 for an untrusted workspace", async () => {
    expect(await runCli(["trust-me"], captureIo("/work"), commands)).toBe(exitCode.notTrusted);
  });
});

verifies("cli.help", () => {
  it("lists every command with its summary for --help", async () => {
    const io = captureIo("/work");
    expect(await runCli(["--help"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "Usage: halonic <command> [arguments]",
      "",
      "Commands:",
      "  greet     Say hello.",
      "  trust-me  Refuse, as an untrusted workspace does.",
      "",
      "Exit codes: 0 worked · 1 failed or found errors · 2 wrong usage or input · 3 not trusted ·",
      "4 not found · 5 conflict · 6 signed out · 7 not allowed · 8 limit reached · 9 unavailable",
      "",
      "Run halonic <command> --help for a command's arguments and options.",
    ]);
  });

  it("prints the same list for help and -h", async () => {
    for (const flag of ["help", "-h"]) {
      const io = captureIo("/work");
      expect(await runCli([flag], io, commands)).toBe(exitCode.ok);
      expect(io.stdout[0]).toBe("Usage: halonic <command> [arguments]");
    }
  });

  it("prints one command's usage, summary and options", async () => {
    const io = captureIo("/work");
    expect(await runCli(["greet", "--help"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "Usage: halonic greet <name> [--loud]",
      "",
      "Say hello.",
      "",
      "Options:",
      "  --loud        Shout it.",
      "  --from <who>  Who says it.",
    ]);
  });

  it("prints no options section for a command without options", async () => {
    const io = captureIo("/work");
    await runCli(["trust-me", "-h"], io, commands);
    expect(io.stdout).toEqual([
      "Usage: halonic trust-me",
      "",
      "Refuse, as an untrusted workspace does.",
    ]);
  });

  it("prints the list and exits with 2 without a command", async () => {
    const io = captureIo("/work");
    expect(await runCli([], io, commands)).toBe(exitCode.usage);
    expect(io.stdout[2]).toBe("Commands:");
  });

  it("names an unknown command, prints the list and exits with 2", async () => {
    const io = captureIo("/work");
    expect(await runCli(["deploy"], io, commands)).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe('Unknown command "deploy".');
    expect(io.stderr).toContain("  greet     Say hello.");
  });
});

verifies("cli.help-exit-codes", () => {
  it("lists every exit code with its words in the help", async () => {
    const io = captureIo("/work");
    await runCli(["--help"], io, commands);
    const help = io.stdout.join("\n");
    for (const { code, meaning } of exitCodeMeanings) {
      expect(help).toContain(`${code} ${meaning}`);
    }
  });

  it("has words for every exit code, in code order", () => {
    expect(exitCodeMeanings.map(({ code }) => code)).toEqual(Object.values(exitCode));
  });
});
