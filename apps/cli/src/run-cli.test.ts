import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type CliCommand, UsageError } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";

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
    expect(exitCode).toEqual({ ok: 0, failed: 1, usage: 2, notTrusted: 3 });
  });

  it("prints a usage error with the usage line and exits with 2", async () => {
    const io = captureIo("/work");
    expect(await runCli(["greet"], io, commands)).toBe(exitCode.usage);
    expect(io.stderr).toEqual(["Say who to greet.", "Usage: halonic greet <name> [--loud]"]);
  });

  it("treats an unknown option or a missing value as a usage error", async () => {
    const unknown = captureIo("/work");
    expect(await runCli(["greet", "Ada", "--colour"], unknown, commands)).toBe(exitCode.usage);
    expect(unknown.stderr[0]).toContain("--colour");
    const noValue = captureIo("/work");
    expect(await runCli(["greet", "Ada", "--from"], noValue, commands)).toBe(exitCode.usage);
    expect(noValue.stderr[0]).toContain("--from");
  });

  it("prints a failure after Error: and exits with 1", async () => {
    const io = captureIo("/work");
    expect(await runCli(["greet", "nobody"], io, commands)).toBe(exitCode.failed);
    expect(io.stderr).toEqual(["Error: nobody is there"]);
    const thrownText = captureIo("/work");
    expect(await runCli(["greet", "a ghost"], thrownText, commands)).toBe(exitCode.failed);
    expect(thrownText.stderr).toEqual(["Error: boo"]);
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
