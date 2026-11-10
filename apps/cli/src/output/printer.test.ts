import type { Secrets } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type CliCommand, UsageError } from "../command.ts";
import { exitCode } from "../exit-code.ts";
import { defineMessages } from "../messages/define.ts";
import { markPart, phrase } from "../messages/phrase.ts";
import { runCli, type Terminal } from "../run-cli.ts";
import { captureIo } from "../test/capture-io.ts";

const findMessages = defineMessages("find", {
  summary: () => phrase`Find something`,
  action: (what: string) => phrase`find ${what}`,
  whatToFind: () => phrase`Say what to find.`,
  found: (what: string) => phrase`Found ${what}.`,
});

/** A command that finds things, and fails in each way a command can. */
const findCommand: CliCommand = {
  name: "find",
  usage: "<what>",
  summary: findMessages.summary(),
  action: (input) => findMessages.action(input.positionals[0] ?? ""),
  options: {},
  async run(input, context) {
    const [what] = input.positionals;
    if (what === undefined) {
      throw new UsageError(findMessages.whatToFind());
    }
    if (what === "the moon") {
      throw new KindedError("not_found", "The moon isn't here.", {
        fix: "Look for something that is here.",
      });
    }
    if (what === "the key") {
      const key = await context.secrets.get("key");
      throw new KindedError("unavailable", `The vault refused ${key}.`);
    }
    if (what === "the docs") {
      // An error from another layer, with a code and a docs link but no fix.
      throw {
        kind: "not_found",
        message: "The docs moved.",
        code: "docs-moved",
        docs: "https://docs.halonic.com/",
      };
    }
    if (what === "my key") {
      return {
        exitCode: exitCode.ok,
        lines: [],
        json: { found: { key: await context.secrets.get("key") } },
      };
    }
    if (what === "a bug") {
      throw new Error("undefined is not a function");
    }
    return {
      exitCode: exitCode.ok,
      lines: [phrase`${markPart("done")} ${findMessages.found(what).phrase}`],
      json: { found: what },
    };
  },
};

/** Runs `find` and reads its stdout as the one JSON document it must be. */
async function runJson(args: readonly string[], secrets?: Secrets) {
  const io = captureIo("/work");
  const code = await runCli(args, io, [findCommand], secrets === undefined ? {} : { secrets });
  expect(io.stdout).toHaveLength(1);
  return { code, document: JSON.parse(io.stdout[0] ?? ""), stderr: io.stderr };
}

verifies("cli.json", () => {
  it("prints a command's result lines, with the stream's marks", async () => {
    const io = captureIo("/work");
    expect(await runCli(["find", "keys"], io, [findCommand])).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Found keys."]);
    const notUtf8: Terminal = {
      env: { LANG: "en_US.ISO-8859-1" },
      platform: "linux",
      stdoutIsTerminal: true,
      stderrIsTerminal: true,
    };
    const ascii = captureIo("/work");
    await runCli(["find", "keys", "--no-color"], ascii, [findCommand], { terminal: notUtf8 });
    expect(ascii.stdout).toEqual(["ok Found keys."]);
  });

  it("gives the result as one document, with outputVersion and ok first", async () => {
    const { code, document, stderr } = await runJson(["find", "keys", "--json"]);
    expect(code).toBe(exitCode.ok);
    expect(Object.entries(document)).toEqual([
      ["outputVersion", 1],
      ["ok", true],
      ["found", "keys"],
    ]);
    expect(stderr).toEqual([]);
  });

  it("gives an error as the same words, on stdout, with the same exit code", async () => {
    const { code, document, stderr } = await runJson(["--json", "find", "the moon"]);
    expect(code).toBe(exitCode.notFound);
    expect(document).toEqual({
      outputVersion: 1,
      ok: false,
      error: {
        kind: "not_found",
        message: "The moon isn't here.",
        fix: "Look for something that is here.",
      },
    });
    expect(stderr).toEqual([]);
    const coded = await runJson(["find", "the docs", "--json"]);
    expect(coded.document.error).toEqual({
      kind: "not_found",
      code: "docs-moved",
      message: "The docs moved.",
    });
  });

  it("gives a wrong command line as a usage error", async () => {
    const unknown = await runJson(["--json", "deploy"]);
    expect(unknown.code).toBe(exitCode.usage);
    expect(unknown.document.error).toEqual({
      kind: "usage",
      message: 'There\'s no command "deploy".',
      fix: "Run halonic --help to see every command.",
    });
    const missing = await runJson(["find", "--json"]);
    expect(missing.code).toBe(exitCode.usage);
    expect(missing.document.error).toEqual({
      kind: "usage",
      message: "Say what to find.",
      fix: "Usage: halonic find <what>",
    });
    const badOption = await runJson(["find", "keys", "--jsno", "--json"]);
    expect(badOption.document.error.message).toBe("There's no option --jsno. Did you mean --json?");
    const noCommand = await runJson(["--json"]);
    expect(noCommand.code).toBe(exitCode.usage);
    expect(noCommand.document.error).toEqual({
      kind: "usage",
      message: "Say which command to run.",
      fix: "Run halonic --help to see every command.",
    });
  });

  it("gives a command that only hands off, run on its own, as a usage error", async () => {
    const io = captureIo("/work");
    const groupCommand: CliCommand = {
      name: "group",
      usage: "<command>",
      summary: findMessages.summary(),
      options: {},
      subcommands: [findCommand],
    };
    expect(await runCli(["group", "--json"], io, [groupCommand])).toBe(exitCode.usage);
    expect(io.stdout).toHaveLength(1);
    expect(JSON.parse(io.stdout[0] ?? "").error).toEqual({
      kind: "usage",
      message: "Say which command to run.",
      fix: "Run halonic group --help to see its commands.",
    });
    expect(io.stderr).toEqual([]);
  });

  it("keeps help that was asked for as text", async () => {
    for (const args of [["find", "--help"], ["help"], ["--help"]]) {
      const text = captureIo("/work");
      await runCli(args, text, [findCommand]);
      const json = captureIo("/work");
      expect(await runCli([...args, "--json"], json, [findCommand])).toBe(exitCode.ok);
      expect(json.stdout).toEqual(text.stdout);
      expect(json.stdout.length).toBeGreaterThan(1);
    }
  });

  it("never gives a bug's own text, and sends it to stderr with --debug", async () => {
    const plain = await runJson(["find", "a bug", "--json"]);
    expect(plain.code).toBe(exitCode.failed);
    expect(plain.document.error).toEqual({
      kind: "internal",
      message: "Halonic ran into a problem it can't explain yet.",
      fix: "Run it again with --debug to see the details, and report it: https://github.com/halonic-com/halonic/issues",
    });
    expect(plain.stderr).toEqual([]);
    const debug = await runJson(["find", "a bug", "--json", "--debug"]);
    expect(JSON.stringify(debug.document)).not.toContain("undefined is not a function");
    expect(debug.stderr[0]).toBe("Error: undefined is not a function");
  });

  it("removes a secret the command loaded from the document", async () => {
    // A made-up value, not shaped like any real key.
    const secrets: Secrets = { get: async () => "made-up-key-7" };
    const { document } = await runJson(["find", "the key", "--json"], secrets);
    expect(document.error.message).toBe("The vault refused [secret removed].");
  });

  it("removes a loaded secret from a result's fields, before JSON escapes it", async () => {
    // Made-up values, one with the characters JSON escapes.
    for (const key of ["made-up-key-7", 'made"up\\key']) {
      const secrets: Secrets = { get: async () => key };
      const { code, document } = await runJson(["find", "my key", "--json"], secrets);
      expect(code).toBe(exitCode.ok);
      expect(document.found).toEqual({ key: "[secret removed]" });
    }
  });
});
