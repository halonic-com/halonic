import type { Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { CliCommand } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { exitCodeOfError } from "./exit-code-for.ts";
import { defineMessages } from "./messages/define.ts";
import { phrase } from "./messages/phrase.ts";
import { trustMessages } from "./messages/trust.ts";
import { NotTrustedError } from "./not-trusted.ts";
import { runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";

/** A made-up fingerprint in the real shape. */
const fingerprint = `hfp1:${"9f86d081".repeat(8)}`;

/** The shape `tail -n1` must give on exit 3 (build plan item 10a). */
const bareFingerprint = /^hfp1:[0-9a-f]{64}$/;

const testMessages = defineMessages("test", {
  summary: () => phrase`Start a workflow, as an untrusted workspace refuses it`,
  checkHeading: () => phrase`Trust check for Acme (./acme)`,
  program: (env: string) => phrase`stdio-mail · runs mail-server with ${env}`,
});

/** A command that refuses as every command that needs trust does, after loading a secret. */
const startCommand: CliCommand = {
  name: "start",
  usage: "",
  summary: testMessages.summary(),
  options: {},
  async run(_input, context) {
    const token = (await context.secrets.get("mail-token")) ?? "";
    throw new NotTrustedError({
      problem: trustMessages.notTrustedYet("Acme"),
      fix: trustMessages.reviewThenTrust("./acme"),
      fingerprint,
      check: [testMessages.checkHeading().phrase, testMessages.program(`TOKEN=${token}`).phrase],
    });
  },
};

const secrets: Secrets = {
  get: async (name) => (name === "mail-token" ? "s3cret-mail-token" : null),
};

async function start(...args: string[]) {
  const io = captureIo("<cwd>");
  const code = await runCli(["start", ...args], io, [startCommand], { secrets });
  return { code, stdout: io.stdout, stderr: io.stderr };
}

verifies("cli.not-trusted", () => {
  it("shows the check, then the ✕ and fix lines on stderr, and exits with 3", async () => {
    const { code, stderr } = await start();
    expect(code).toBe(exitCode.notTrusted);
    expect(stderr).toEqual([
      "Trust check for Acme (./acme)",
      "stdio-mail · runs mail-server with TOKEN=[secret removed]",
      "✕ Acme isn't trusted on this computer yet.",
      "  Review what it can start, then trust it: halonic trust --dir ./acme",
    ]);
  });

  it("ends stdout with the bare, full fingerprint and nothing else", async () => {
    const { stdout } = await start();
    expect(stdout).toEqual([fingerprint]);
    expect(stdout.at(-1)).toMatch(bareFingerprint);
  });

  it("gives --json one error document with kind not_trusted and the full fingerprint", async () => {
    const { code, stdout, stderr } = await start("--json");
    expect(code).toBe(exitCode.notTrusted);
    expect(stderr).toEqual([]);
    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0] ?? "")).toEqual({
      outputVersion: 1,
      ok: false,
      error: {
        kind: "not_trusted",
        code: "not-trusted",
        message: "Acme isn't trusted on this computer yet.",
        fix: "Review what it can start, then trust it: halonic trust --dir ./acme",
        fingerprint,
      },
    });
  });

  it("never shortens the fingerprint, with or without --json", async () => {
    for (const run of [await start(), await start("--json")]) {
      const printed = [...run.stdout, ...run.stderr].join("\n");
      expect(printed).toContain(fingerprint);
      expect(printed).not.toContain("…");
    }
  });

  it("is the only error that ends with exit code 3", () => {
    const error = new NotTrustedError({
      problem: trustMessages.notTrustedYet("Acme"),
      fix: trustMessages.reviewThenTrust(),
      fingerprint,
      check: [],
    });
    expect(exitCodeOfError(error)).toBe(exitCode.notTrusted);
    expect(exitCodeOfError({ kind: "denied", message: "No." })).toBe(exitCode.denied);
    expect(exitCodeOfError(new Error("a bug"))).toBe(exitCode.failed);
  });
});
