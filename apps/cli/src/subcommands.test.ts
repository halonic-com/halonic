import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type CliCommand, type CommandResult, UsageError } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { defineMessages } from "./messages/define.ts";
import { phrase } from "./messages/phrase.ts";
import { runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";

const runsMessages = defineMessages("runs", {
  showSummary: () => phrase`Show what one run did`,
  showEvents: () => phrase`Print every event of the run.`,
  whichRun: () => phrase`Say which run to show.`,
  sendSummary: () => phrase`Answer a run that's waiting for you`,
  summary: () => phrase`List runs, show what one did, or answer one that's waiting for you`,
  limit: () => phrase`How many runs to list.`,
  pluginSummary: () => phrase`Add, list or remove plugins`,
  pluginListSummary: () => phrase`List the plugins`,
});

/** A result with one line for stdout and nothing for `--json`. */
function oneLine(line: string): CommandResult {
  return { exitCode: exitCode.ok, lines: [phrase`${line}`], json: {} };
}

const nothing: CommandResult = { exitCode: exitCode.ok, lines: [], json: {} };

/** `runs show <run-id>`: prints the id it was given, or refuses without one. */
const showCommand: CliCommand = {
  name: "show",
  usage: "<run-id>",
  summary: runsMessages.showSummary(),
  options: { events: { type: "boolean", description: runsMessages.showEvents() } },
  async run(input) {
    const [runId] = input.positionals;
    if (runId === undefined) {
      throw new UsageError(runsMessages.whichRun());
    }
    return oneLine(
      input.options["events"] === true ? `Run ${runId} with its events` : `Run ${runId}`,
    );
  },
};

const sendCommand: CliCommand = {
  name: "send",
  usage: "<run-id> <event>",
  summary: runsMessages.sendSummary(),
  options: {},
  run: async () => nothing,
};

/** `runs`: lists runs itself, and hands `show` and `send` to its subcommands. */
const runsCommand: CliCommand = {
  name: "runs",
  usage: "[--limit <n>]",
  summary: runsMessages.summary(),
  options: { limit: { type: "string", valueName: "n", description: runsMessages.limit() } },
  subcommands: [showCommand, sendCommand],
  async run(input) {
    return oneLine(`The ${String(input.options["limit"] ?? "20")} newest runs`);
  },
};

/** `plugin`: does nothing itself, only hands off to `list`. */
const pluginCommand: CliCommand = {
  name: "plugin",
  usage: "<command>",
  summary: runsMessages.pluginSummary(),
  options: {},
  subcommands: [
    {
      name: "list",
      usage: "",
      summary: runsMessages.pluginListSummary(),
      options: {},
      run: async () => nothing,
    },
  ],
};

const commands = [runsCommand, pluginCommand];

verifies("cli.subcommands", () => {
  it("hands the word after a command to its subcommand, with the arguments after it", async () => {
    const io = captureIo("/work");
    expect(await runCli(["runs", "show", "01JD8Q", "--events"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["Run 01JD8Q with its events"]);
    expect(io.stderr).toEqual([]);
  });

  it("runs the command itself when no subcommand follows it", async () => {
    const io = captureIo("/work");
    expect(await runCli(["runs", "--limit", "5"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["The 5 newest runs"]);
  });

  it("names both words in a subcommand's usage line", async () => {
    const io = captureIo("/work");
    expect(await runCli(["runs", "show"], io, commands)).toBe(exitCode.usage);
    expect(io.stderr).toEqual(["✕ Say which run to show.", "  Usage: halonic runs show <run-id>"]);
  });

  it("lists a command's subcommands in its help, before its options", async () => {
    const io = captureIo("/work");
    expect(await runCli(["runs", "--help"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "Usage: halonic runs [--limit <n>]",
      "",
      "List runs, show what one did, or answer one that's waiting for you",
      "",
      "Commands:",
      "  show  Show what one run did",
      "  send  Answer a run that's waiting for you",
      "",
      "Options:",
      "  --limit <n>  How many runs to list.",
      "",
      "Run halonic runs <command> --help for a command's arguments and options.",
    ]);
  });

  it("prints a subcommand's own help", async () => {
    const io = captureIo("/work");
    expect(await runCli(["runs", "show", "-h"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "Usage: halonic runs show <run-id>",
      "",
      "Show what one run did",
      "",
      "Options:",
      "  --events  Print every event of the run.",
    ]);
  });

  it("names an unknown subcommand, asks about the close one and exits with 2", async () => {
    const io = captureIo("/work");
    expect(await runCli(["runs", "shwo", "01JD8Q"], io, commands)).toBe(exitCode.usage);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual([
      '✕ There\'s no command "runs shwo". Did you mean runs show?',
      "  Run halonic runs --help to see its commands.",
    ]);
  });

  it("gives the same error for a word after the command's options", async () => {
    const io = captureIo("/work");
    expect(await runCli(["runs", "--limit", "5", "deploy"], io, commands)).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      '✕ There\'s no command "runs deploy".',
      "  Run halonic runs --help to see its commands.",
    ]);
  });

  it("prints the help of a command that only hands off, and exits with 2 without a subcommand", async () => {
    const io = captureIo("/work");
    expect(await runCli(["plugin"], io, commands)).toBe(exitCode.usage);
    expect(io.stdout).toEqual([
      "Usage: halonic plugin <command>",
      "",
      "Add, list or remove plugins",
      "",
      "Commands:",
      "  list  List the plugins",
      "",
      "Run halonic plugin <command> --help for a command's arguments and options.",
    ]);
    expect(await runCli(["plugin", "list"], captureIo("/work"), commands)).toBe(exitCode.ok);
  });
});

verifies("cli.subcommand-placement", () => {
  it("says where a real subcommand goes when it comes after the command's options", async () => {
    const io = captureIo("/work");
    expect(await runCli(["runs", "--limit", "5", "show", "01JD8Q"], io, commands)).toBe(
      exitCode.usage,
    );
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual([
      "✕ show goes right after runs, before any options.",
      "  Usage: halonic runs show <run-id>",
    ]);
  });
});
