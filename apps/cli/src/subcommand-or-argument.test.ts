import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { CliCommand, CommandInput, CommandResult } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { defineMessages } from "./messages/define.ts";
import { phrase } from "./messages/phrase.ts";
import { runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";

const testMessages = defineMessages("deploy", {
  summary: () => phrase`Deploy a workspace to one of its deployments`,
  statusSummary: () => phrase`Show what's live on a deployment`,
  plan: () => phrase`Show what a deploy would change, and change nothing.`,
  runsSummary: () => phrase`List runs`,
});

/** A result whose one line says which command ran with which input. */
function echo(name: string, input: CommandInput): CommandResult {
  const plan = input.options["plan"] === true ? " --plan" : "";
  const line = `${name} ${input.positionals.join(" ")}${plan}`;
  return { exitCode: exitCode.ok, lines: [phrase`${line}`], json: {} };
}

/** `deploy [<deployment>]` next to `deploy status <deployment>`, as ADR 5.6 has them. */
const deployCommand: CliCommand = {
  name: "deploy",
  usage: "[<deployment>] [--plan]",
  summary: testMessages.summary(),
  options: { plan: { type: "boolean", description: testMessages.plan() } },
  argumentsBesideSubcommands: true,
  subcommands: [
    {
      name: "status",
      usage: "<deployment>",
      takesArguments: true,
      summary: testMessages.statusSummary(),
      options: {},
      run: async (input) => echo("status", input),
    },
  ],
  run: async (input) => echo("deploy", input),
};

/** `runs`, which has subcommands and no arguments of its own. */
const runsCommand: CliCommand = {
  name: "runs",
  usage: "",
  summary: testMessages.runsSummary(),
  options: {},
  subcommands: [
    {
      name: "show",
      usage: "<run-id>",
      takesArguments: true,
      summary: testMessages.runsSummary(),
      options: {},
      run: async (input) => echo("show", input),
    },
  ],
  run: async (input) => echo("runs", input),
};

const commands = [deployCommand, runsCommand];

verifies("cli.subcommand-or-argument", () => {
  it("runs the command with a word that names none of its subcommands", async () => {
    const io = captureIo("/work");
    expect(await runCli(["deploy", "web"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["deploy web"]);
    expect(io.stderr).toEqual([]);
  });

  it("takes that word after the command's options too", async () => {
    const io = captureIo("/work");
    expect(await runCli(["deploy", "--plan", "web"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["deploy web --plan"]);
  });

  it("still hands a subcommand's word to the subcommand", async () => {
    const io = captureIo("/work");
    expect(await runCli(["deploy", "status", "web"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["status web"]);
  });

  it("still says where a subcommand goes when it comes after the options", async () => {
    const io = captureIo("/work");
    expect(await runCli(["deploy", "--plan", "status", "web"], io, commands)).toBe(exitCode.usage);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual([
      "✕ status goes right after deploy, before any options.",
      "  Usage: halonic deploy status <deployment>",
    ]);
  });

  it("keeps the unknown-command error for a command without arguments of its own", async () => {
    const io = captureIo("/work");
    expect(await runCli(["runs", "web"], io, commands)).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      '✕ There\'s no command "runs web".',
      "  Run halonic runs --help to see its commands.",
    ]);
  });
});
