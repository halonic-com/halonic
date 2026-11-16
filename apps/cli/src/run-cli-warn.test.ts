import type { Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { CliCommand } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { defineMessages } from "./messages/define.ts";
import { phrase } from "./messages/phrase.ts";
import { runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";

const warnMessages = defineMessages("warn", {
  summary: () => phrase`Warns once`,
  warned: (key: string) => phrase`tools wait for approval, key ${key}`,
  done: () => phrase`Done.`,
});

// A made-up value, not shaped like any real key.
const apiKey = "made-up-key-42";
const secrets: Secrets = { get: async (name) => (name === "provider-key" ? apiKey : null) };

/** A command that warns once, quoting the key it loaded, and then finishes. */
const warningCommand: CliCommand = {
  name: "warn",
  usage: "",
  summary: warnMessages.summary(),
  options: {},
  async run(_input, context) {
    const key = await context.secrets.get("provider-key");
    context.warn(warnMessages.warned(`${key}`).phrase);
    return { exitCode: exitCode.ok, lines: [warnMessages.done().phrase], json: { done: true } };
  },
};

verifies("cli.warn-lines", () => {
  it("writes a warning to stderr without --debug, scrubbed, and leaves stdout as it was", async () => {
    const io = captureIo("/work");

    const code = await runCli(["warn"], io, [warningCommand], { secrets });

    expect(code).toBe(exitCode.ok);
    expect(io.stderr).toEqual(["tools wait for approval, key [secret removed]"]);
    expect(io.stdout).toEqual(["Done."]);
  });

  it("keeps stdout one JSON document with --json", async () => {
    const io = captureIo("/work");

    await runCli(["warn", "--json"], io, [warningCommand], { secrets });

    expect(io.stderr).toEqual(["tools wait for approval, key [secret removed]"]);
    expect(JSON.parse(io.stdout.join("\n"))).toMatchObject({ ok: true });
  });
});
