import type { Secrets } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type CliCommand, UsageError } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { defineMessages } from "./messages/define.ts";
import { bold, markPart, phrase } from "./messages/phrase.ts";
import { runCli, type Terminal } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";

/** An error class with its own kind and fix, as an existing error class gets them. */
class NotHereError extends Error {
  readonly kind = "not_found";
  readonly fix = "Greet someone who is here, such as Ada.";
}

/** The test commands' own sentences, as a command's area of the catalogue holds them. */
const greetMessages = defineMessages("greet", {
  summary: () => phrase`Say hello`,
  loud: () => phrase`Shout it`,
  from: () => phrase`Who says it`,
  action: (name: string) => phrase`greet ${bold(name)}`,
  whoToGreet: () => phrase`Say who to greet.`,
  refuse: () => phrase`Refuse, as an untrusted workspace does`,
  call: () => phrase`Call a provider with the key.`,
});

/** A command that greets, to drive the CLI without touching any files. */
const greetCommand: CliCommand = {
  name: "greet",
  usage: "<name> [--loud]",
  summary: greetMessages.summary(),
  action: (input) => greetMessages.action(input.positionals[0] ?? ""),
  options: {
    loud: { type: "boolean", description: greetMessages.loud() },
    from: { type: "string", valueName: "who", description: greetMessages.from() },
  },
  async run(input) {
    const [name] = input.positionals;
    if (name === undefined) {
      throw new UsageError(greetMessages.whoToGreet());
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
    const greeting =
      input.options["loud"] === true ? `HELLO ${name.toUpperCase()}` : `Hello ${name}`;
    return {
      exitCode: exitCode.ok,
      lines: [phrase`${markPart("done")} ${greeting}`],
      json: { name },
    };
  },
};

const trustCommand: CliCommand = {
  name: "trust-me",
  usage: "",
  summary: greetMessages.refuse(),
  options: {},
  run: async () => ({ exitCode: exitCode.notTrusted, lines: [], json: {} }),
};

const commands = [greetCommand, trustCommand];

/** What the CLI prints when greeting nobody fails without a kind, instead of its text. */
const internalLines = [
  "✕ Couldn't greet nobody: Halonic ran into a problem it can't explain yet.",
  "  Run it again with --debug to see the details, and report it: https://github.com/halonic-com/halonic/issues",
];

/** A terminal on both streams, with colour. */
const terminal: Terminal = {
  env: { LANG: "en_US.UTF-8" },
  platform: "linux",
  stdoutIsTerminal: true,
  stderrIsTerminal: true,
};

describe("runCli", () => {
  it("runs the named command with its arguments and options", async () => {
    const io = captureIo("/work");
    expect(await runCli(["greet", "Ada", "--loud"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ HELLO ADA"]);
    expect(io.stderr).toEqual([]);
  });

  it("colours the ✕ mark in a terminal, and never through a pipe", async () => {
    const coloured = captureIo("/work");
    await runCli(["greet"], coloured, commands, { terminal });
    expect(coloured.stderr[0]).toBe("\u001b[31m✕\u001b[39m Say who to greet.");
    const plain = captureIo("/work");
    await runCli(["greet", "--no-color"], plain, commands, { terminal });
    expect(plain.stderr[0]).toBe("✕ Say who to greet.");
  });

  it("takes the global options anywhere on the command line", async () => {
    for (const args of [
      ["--verbose", "greet", "Ada"],
      ["greet", "Ada", "--debug", "--no-color"],
    ]) {
      const io = captureIo("/work");
      expect(await runCli(args, io, commands)).toBe(exitCode.ok);
      expect(io.stdout).toEqual(["✓ Hello Ada"]);
    }
  });

  it("treats a global option after -- as an argument", async () => {
    const io = captureIo("/work");
    await runCli(["greet", "--", "--json"], io, commands);
    expect(io.stdout).toEqual(["✓ Hello --json"]);
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
    expect(unknown.stderr).toEqual([
      "✕ There's no option --colour. Did you mean --no-color?",
      "  Run halonic greet --help to see its options.",
    ]);
    const short = captureIo("/work");
    expect(await runCli(["greet", "Ada", "-v"], short, commands)).toBe(exitCode.usage);
    expect(short.stderr[0]).toBe("✕ There's no option -v.");
    const noValue = captureIo("/work");
    expect(await runCli(["greet", "Ada", "--from"], noValue, commands)).toBe(exitCode.usage);
    expect(noValue.stderr).toEqual([
      "✕ --from needs a value: --from <who>.",
      "  Usage: halonic greet <name> [--loud]",
    ]);
    const optionAsValue = captureIo("/work");
    expect(await runCli(["greet", "Ada", "--from", "--loud"], optionAsValue, commands)).toBe(
      exitCode.usage,
    );
    expect(optionAsValue.stderr[0]).toBe("✕ --from needs a value: --from <who>.");
    const inlineValue = captureIo("/work");
    expect(await runCli(["greet", "Ada", "--from=-x"], inlineValue, commands)).toBe(exitCode.ok);
    const switchValue = captureIo("/work");
    expect(await runCli(["greet", "Ada", "--loud=yes"], switchValue, commands)).toBe(
      exitCode.usage,
    );
    expect(switchValue.stderr[0]).toBe(
      "✕ --loud doesn't take a value, and you gave one: --loud=yes.",
    );
  });

  it("ends a failure without a kind with 1, and never shows its text", async () => {
    const io = captureIo("/work");
    expect(await runCli(["greet", "nobody"], io, commands)).toBe(exitCode.failed);
    expect(io.stderr).toEqual(internalLines);
    const thrownText = captureIo("/work");
    expect(await runCli(["greet", "a ghost"], thrownText, commands)).toBe(exitCode.failed);
    expect(thrownText.stderr[1]).toBe(internalLines[1]);
    expect(thrownText.stderr.join("\n")).not.toContain("boo");
  });

  it("ends a failure with the exit code of its kind and prints its fix", async () => {
    const io = captureIo("/work");
    expect(await runCli(["greet", "the moon"], io, commands)).toBe(exitCode.notFound);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual([
      "✕ Couldn't greet the moon: the moon isn't here.",
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
    expect(io.stdout).toEqual(["✓ Hello --debug"]);
  });

  it("passes on the code a command returns, such as 3 for an untrusted workspace", async () => {
    expect(await runCli(["trust-me"], captureIo("/work"), commands)).toBe(exitCode.notTrusted);
  });
});

verifies("cli.help", () => {
  it("prints cli-output 1.9's help for --help, with the commands there are", async () => {
    const io = captureIo("/work");
    expect(await runCli(["--help"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "Run and check Halonic workspaces from the command line.",
      "",
      "Usage: halonic <command> [arguments]",
      "",
      "Commands:",
      "  greet     Say hello",
      "  trust-me  Refuse, as an untrusted workspace does",
      "",
      "Options for every command: --json, --no-color, --verbose, --debug, --help",
      "",
      "Exit codes: 0 worked · 1 failed or found errors · 2 wrong usage or input ·",
      "3 not trusted · 4 not found · 5 conflict · 6 signed out · 7 not allowed ·",
      "8 limit reached · 9 didn't answer or the sandbox can't start ·",
      "130 or 143 stopped",
      "",
      "Run halonic <command> --help for a command's arguments and options.",
    ]);
  });

  it("prints the same help for help and -h", async () => {
    for (const flag of ["help", "-h"]) {
      const io = captureIo("/work");
      expect(await runCli([flag], io, commands)).toBe(exitCode.ok);
      expect(io.stdout[0]).toBe("Run and check Halonic workspaces from the command line.");
    }
  });

  it("prints one command's usage, summary and options", async () => {
    const io = captureIo("/work");
    expect(await runCli(["greet", "--help"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "Usage: halonic greet <name> [--loud]",
      "",
      "Say hello",
      "",
      "Options:",
      "  --loud        Shout it",
      "  --from <who>  Who says it",
    ]);
  });

  it("prints no options section for a command without options", async () => {
    const io = captureIo("/work");
    await runCli(["trust-me", "-h"], io, commands);
    expect(io.stdout).toEqual([
      "Usage: halonic trust-me",
      "",
      "Refuse, as an untrusted workspace does",
    ]);
  });

  it("prints the help and exits with 2 without a command", async () => {
    const io = captureIo("/work");
    expect(await runCli([], io, commands)).toBe(exitCode.usage);
    expect(io.stdout[4]).toBe("Commands:");
  });

  it("names an unknown command and where to see them all, without the list, and exits with 2", async () => {
    const io = captureIo("/work");
    expect(await runCli(["deploy"], io, commands)).toBe(exitCode.usage);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual([
      '✕ There\'s no command "deploy".',
      "  Run halonic --help to see every command.",
    ]);
  });

  it("offers the one command within two edits of a typo", async () => {
    const io = captureIo("/work");
    await runCli(["gerte"], io, commands);
    expect(io.stderr[0]).toBe('✕ There\'s no command "gerte". Did you mean greet?');
  });

  it("keeps every help line within 80 columns", async () => {
    const io = captureIo("/work");
    await runCli(["--help"], io, commands);
    for (const line of io.stdout) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });
});

verifies("cli.help-exit-codes", () => {
  it("lists every exit code in the help, and 130 and 143 for a stop", async () => {
    const io = captureIo("/work");
    await runCli(["--help"], io, commands);
    const help = io.stdout.join("\n");
    for (const code of Object.values(exitCode)) {
      expect(help).toMatch(new RegExp(`(^|\\s)${code} [a-z]`, "m"));
    }
    expect(help).toContain("130 or 143 stopped");
  });
});

verifies("cli.print-error", () => {
  // A made-up value, not shaped like any real key.
  const apiKey = "made-up-key-\nsecond-line-42";

  /** A command that loads the key and fails with an error quoting it, as a provider call might. */
  const callCommand: CliCommand = {
    name: "call",
    usage: "",
    summary: greetMessages.call(),
    options: {},
    async run(_input, context) {
      const key = await context.secrets.get("provider-key");
      const failure = new KindedError("unavailable", `The provider refused ${key}.`, {
        fix: `Check ${encodeURIComponent(key ?? "")}, then run again.`,
      });
      failure.stack = `KindedError: The provider refused ${key}.\n    at call (call.ts:1:1)`;
      throw failure;
    },
  };

  it("scrubs a secret a command loaded from every line it prints, with --debug", async () => {
    const io = captureIo("/work");
    const secrets: Secrets = {
      get: async (name) => (name === "provider-key" ? apiKey : null),
    };
    expect(await runCli(["call", "--debug"], io, [callCommand], { secrets })).toBe(
      exitCode.unavailable,
    );
    expect(io.stderr).toEqual([
      "✕ The provider refused [secret removed].",
      "  Check [secret removed], then run again.",
      "KindedError: The provider refused [secret removed].",
      "    at call (call.ts:1:1)",
    ]);
  });
});
