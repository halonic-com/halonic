import { mkdtempSync } from "node:fs";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { RunHistory } from "@halonicjs/app";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliCommand } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { goldenText, heavyTestTimeout, runGolden } from "../../test/golden.ts";
import { checklistProblems } from "../../test/golden-checklist.ts";
import { turnOffLocalOnly } from "../../test/local-only.ts";
import { pastedKey, pasteKeyIntoProvider } from "../../test/pasted-key.ts";
import { engineStart, testRunSetup } from "../../test/run-setup.ts";
import { leakedAddressParts, userInfoConnectorYaml } from "../../test/user-info-connector.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { nodeProfileEnvironment, openWorkspaceRuns } from "../../workspace-runs.ts";
import { assertTrustable, cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
import { runCommandWith } from "./command.ts";

/** The Acme example, on the test model: Support reply takes Sam's email down the refund path. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const golden = (name: string) => join(import.meta.dirname, "golden", name);

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  // Backstop: the engine is closed by now, but a slow runner may still be finishing a file.
  await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** A profile folder of its own, so each golden mode starts with no runs. */
function freshProfile(): ProfileEnvironment {
  const home = mkdtempSync(join(folder, "profile-"));
  return { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: home } };
}

/** `halonic run` on a fixed clock and fixed ids, with its runs and trust records in `profile`. */
function runCommand(profile: ProfileEnvironment = freshProfile()): CliCommand {
  return runCommandWith(testRunSetup(folder, profile));
}

async function run(...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acme);
  const code = await runCli(["run", ...args], io, [runCommand()]);
  return { code, io };
}

const samsEmail = ["--input", "examples/refund-question.json"];

/** Trusts Acme as it is now, in the trust store `halonic run` reads here. */
async function trustAcme(): Promise<void> {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const read = await readWorkspaceTrust(dir, { path: undefined, endings: [] });
  const { subject } = read;
  const trust = cliTrustService(new FileTrustStore(join(folder, "trust")), fixedClock(engineStart));
  const check = await trust.check(subject);
  assertTrustable(check, read);
  expect((await trust.grant(subject, check.fingerprint, "cli")).ok).toBe(true);
}

verifies("cli.run", () => {
  it("follows Support reply until it waits for the reply's approval, in every mode", {
    timeout: heavyTestTimeout,
  }, async () => {
    const args = ["run", "support-reply", ...samsEmail];
    const output = await runGolden(args, () => [runCommand()], acme);

    expect(output.noColour.exit).toBe(exitCode.ok);
    expect(checklistProblems(output)).toEqual([]);
    expect(goldenText(args, output)).toBe(
      await readFile(golden("support-reply-waiting.txt"), "utf8"),
    );
  });

  it("answers the wait with --event and ends with the receipt", {
    timeout: heavyTestTimeout,
  }, async () => {
    const args = ["run", "support-reply", ...samsEmail, "--event", "approve"];
    const output = await runGolden(args, () => [runCommand()], acme);

    expect(output.noColour.exit).toBe(exitCode.ok);
    expect(checklistProblems(output)).toEqual([]);
    expect(goldenText(args, output)).toBe(
      await readFile(golden("support-reply-approved.txt"), "utf8"),
    );
  });

  it("says which --event the run ended before it took", async () => {
    const { code, io } = await run(
      "support-reply",
      ...samsEmail,
      "--event",
      "approve",
      "--event",
      "reject",
    );

    expect(code).toBe(exitCode.ok);
    expect(io.stdout.slice(-2)).toEqual(["", "! Didn't use --event reject: the run ended first."]);
  });

  it("keeps the run where halonic runs reads it", async () => {
    const profile = freshProfile();
    const io = captureIo(acme);
    await runCli(["run", "support-reply", ...samsEmail], io, [runCommand(profile)]);

    const listed = await new RunHistory(await openWorkspaceRuns(acme, profile)).listRuns();
    expect(listed.runs.map((each) => [each.workflowId, each.status])).toEqual([
      ["support-reply", "waiting"],
    ]);
  });

  it("refuses an event the wait doesn't take, with the one that's close", async () => {
    const { code, io } = await run("support-reply", ...samsEmail, "--event", "aprove");

    expect(code).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      "✕ Couldn't send aprove to run 01jd8q: the step Approve this reply? takes approve or reject.",
      "  Did you mean approve?",
    ]);
  });

  it("ends a failed run with its two lines and exit 1", async () => {
    // Writer's script in the test model's file isn't all text, so the test model can't
    // answer Writer and the first step fails.
    const mock = join(acme, "providers/mock.yaml");
    const script = await readFile(mock, "utf8");
    const firstReply = "- Sam wants a refund for order 1042, which arrived damaged.";
    await writeFile(mock, script.replace(firstReply, "- refuse: not a text reply"));

    const { code, io } = await run("support-reply", ...samsEmail);

    expect(code).toBe(exitCode.failed);
    const failed = io.stdout.findLastIndex((line) => line.startsWith("✕"));
    expect(io.stdout[failed]).toMatch(
      /^✕ Support reply failed in the step Read the email\. Halonic can't tell the cause yet: /,
    );
    // The fix, then the receipt, as `halonic runs show` ends the same run.
    expect(io.stdout.slice(failed + 1).map((line) => line.startsWith("  "))).toEqual([true, true]);
  });

  it("names the secret of a model whose key isn't set, and how to set it (HAL-6585)", async () => {
    // Leave local only and connect a provider, steps 1 to 6, in a shell without the key.
    const workspace = join(acme, "workspace.yaml");
    await writeFile(
      workspace,
      (await readFile(workspace, "utf8")).replace("localOnly: true", "localOnly: false"),
    );
    await writeFile(
      join(acme, "providers/anthropic.yaml"),
      "id: anthropic\nname: Anthropic\ntype: anthropic\nsecret: anthropic\n",
    );
    const models = join(acme, "models.yaml");
    await writeFile(
      models,
      `${await readFile(models, "utf8")}  smart:\n    provider: anthropic\n    model: a-model\n`,
    );
    const writer = join(acme, "hubs/support/agents/writer.agent.yaml");
    await writeFile(writer, `${await readFile(writer, "utf8")}model: smart\n`);
    await trustAcme();

    const { code, io } = await run("support-reply", ...samsEmail);

    expect(code).toBe(exitCode.failed);
    const failed = io.stdout.findLastIndex((line) => line.startsWith("✕"));
    expect(io.stdout.slice(failed, failed + 2)).toEqual([
      "✕ Support reply failed in the step Read the email: there's no key in the secret anthropic (HALONIC_SECRET_ANTHROPIC), used by the model alias smart.",
      "  Set HALONIC_SECRET_ANTHROPIC to your Anthropic key, then run again.",
    ]);
  });
});

describe("halonic run's refusals", () => {
  it("needs exactly one workflow", async () => {
    const none = await run();
    const two = await run("support-reply", "weekly-report");

    expect([none.code, two.code]).toEqual([exitCode.usage, exitCode.usage]);
    expect(none.io.stderr[0]).toBe("✕ halonic run needs a workflow.");
    expect(two.io.stderr[0]).toBe(
      "✕ halonic run takes one workflow, and you gave two: support-reply, weekly-report.",
    );
  });

  it("names the workflow that's close to the one typed", async () => {
    const { code, io } = await run("suport-reply");

    expect(code).toBe(exitCode.notFound);
    expect(io.stderr).toEqual([
      '✕ There\'s no workflow called "suport-reply" in Acme.',
      "  Did you mean support-reply?",
    ]);
  });

  it("lists the workflows when none is close to the one typed", async () => {
    const { code, io } = await run("billing");

    expect(code).toBe(exitCode.notFound);
    expect(io.stderr).toEqual([
      '✕ There\'s no workflow called "billing" in Acme.',
      "  Workflows in Acme: weekly-report, support-reply.",
    ]);
  });

  it("refuses an input that isn't a JSON object, or a file that isn't there", async () => {
    const list = await run("support-reply", "--input", "[1, 2]");
    const text = await run("support-reply", "--input", "{mail}");
    const missing = await run("support-reply", "--input", "examples/gone.json");

    expect([list.code, text.code, missing.code]).toEqual([2, 2, 2]);
    expect([list.io.stderr[0], text.io.stderr[0], missing.io.stderr[0]]).toEqual([
      "✕ Couldn't run support-reply: the input must be a JSON object.",
      "✕ Couldn't run support-reply: the input isn't valid JSON.",
      "✕ Couldn't run support-reply: there's no file examples/gone.json.",
    ]);
    expect([list.io.stderr[1], missing.io.stderr[1]]).toEqual([
      "  Pass a JSON object, in a file or as text, such as --input input.json.",
      "  Check the file name. It's looked for from the folder you ran the command in.",
    ]);
  });

  it("refuses a folder as the input file, with the input's fix", async () => {
    const { code, io } = await run("support-reply", "--input", "examples");

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.slice(0, 2)).toEqual([
      "✕ Couldn't run support-reply: examples is a folder, not a file.",
      "  Pass a JSON object, in a file or as text, such as --input input.json.",
    ]);
  });

  // Windows has no read permission bits, and root reads any file.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "[platform:win32] Windows has no read permission bits: refuses an input file that can't be read",
    async () => {
      // Outside the workspace, so only `--input` reads it.
      const input = join(folder, "input.json");
      await writeFile(input, "{}");
      await chmod(input, 0o000);

      const { code, io } = await run("support-reply", "--input", "../input.json");

      expect(code).toBe(exitCode.usage);
      expect(io.stderr.slice(0, 2)).toEqual([
        "✕ Couldn't run support-reply: ../input.json can't be read.",
        "  Check the file's permissions, or pass the JSON as text.",
      ]);
    },
  );

  it("refuses an untrusted workspace that reaches a real model, and starts nothing", async () => {
    await writeFile(join(acme, "providers/ollama.yaml"), "id: ollama\ntype: ollama\nlocal: true\n");
    const profile = freshProfile();
    const io = captureIo(acme);

    const code = await runCli(["run", "support-reply", ...samsEmail], io, [runCommand(profile)]);

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr).toContain(
      "✕ Couldn't run support-reply: Acme isn't trusted on this computer yet. Nothing ran.",
    );
    expect(io.stderr).toContain("  Review what it can start, then trust it: halonic trust");
    const listed = await new RunHistory(await openWorkspaceRuns(acme, profile)).listRuns();
    expect(listed.total).toBe(0);
  });

  it("names the connector file whose URL can't be trusted, without its address, and starts nothing (HAL-5421)", async () => {
    await turnOffLocalOnly(acme);
    await mkdir(join(acme, "library/connectors"), { recursive: true });
    await writeFile(join(acme, "library/connectors/web.connector.yaml"), userInfoConnectorYaml);
    const profile = freshProfile();
    const io = captureIo(acme);
    const json = captureIo(acme);

    const code = await runCli(["run", "support-reply", ...samsEmail], io, [runCommand(profile)]);
    const jsonCode = await runCli(["run", "support-reply", ...samsEmail, "--json"], json, [
      runCommand(profile),
    ]);

    expect([code, jsonCode]).toEqual([exitCode.usage, exitCode.usage]);
    expect(io.stderr).toContain(
      "✕ Couldn't run support-reply: library/connectors/web.connector.yaml can't be trusted, because the URL has user info.",
    );
    expect(JSON.parse(json.stdout.join("\n"))).toMatchObject({
      ok: false,
      error: { kind: "invalid_input" },
    });
    expect(
      leakedAddressParts([...io.stdout, ...io.stderr, ...json.stdout, ...json.stderr]),
    ).toEqual([]);
    const listed = await new RunHistory(await openWorkspaceRuns(acme, profile)).listRuns();
    expect(listed.total).toBe(0);
  });
});

verifies("cli.workspace-file-problems", () => {
  it("refuses a workspace whose provider file has a pasted key, before trust, and never shows the key", async () => {
    await pasteKeyIntoProvider(acme);
    const profile = freshProfile();
    const io = captureIo(acme);

    const code = await runCli(["run", "support-reply", ...samsEmail], io, [runCommand(profile)]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.slice(0, 2)).toEqual([
      "✕ Couldn't run support-reply: Acme has 2 problems in its files. Nothing ran.",
      "  See them with: halonic validate",
    ]);
    expect([...io.stdout, ...io.stderr].join("\n")).not.toContain(pastedKey);
    const listed = await new RunHistory(await openWorkspaceRuns(acme, profile)).listRuns();
    expect(listed.total).toBe(0);
  });

  it("keeps the user's --dir in the command it suggests", async () => {
    await pasteKeyIntoProvider(acme);
    const io = captureIo(folder);

    await runCli(["run", "support-reply", "--dir", "acme"], io, [runCommand()]);

    expect(io.stderr[1]).toBe(`  See them with: halonic validate --dir .${sep}acme`);
  });
});

verifies("cli.run-failure-debug", () => {
  /**
   * Breaks Writer's script in the test model's file, so the test model can't
   * answer Writer and the run fails in its first step with the general lines.
   */
  async function breakWritersScript(): Promise<void> {
    const mock = join(acme, "providers/mock.yaml");
    const script = await readFile(mock, "utf8");
    const firstReply = "- Sam wants a refund for order 1042, which arrived damaged.";
    await writeFile(mock, script.replace(firstReply, "- refuse: not a text reply"));
  }

  it("doesn't ask for --debug again with it, and prints the run log's details under the lines", async () => {
    await breakWritersScript();

    const { code, io } = await run("support-reply", ...samsEmail, "--debug");

    expect(code).toBe(exitCode.failed);
    const failed = io.stdout.findLastIndex((line) => line.startsWith("✕"));
    expect(io.stdout[failed]).toMatch(/Halonic can't tell the cause yet: /);
    expect(io.stdout[failed + 1]).toBe(
      "  Report it with the details below: https://github.com/halonic-com/halonic/issues",
    );
    expect(io.stdout.join("\n")).not.toContain("--debug");
    expect(io.stderr[0]).toMatch(/^The engine said: Provider "mock": options\.script\.writer /);
    // Whether the step's model calls are listed depends on the engine logging them (HAL-6585).
    expect(io.stderr.at(-1)).toMatch(/^(No model calls in this step\.| {2}writer .*)$/);
  });

  it("prints no details without --debug", async () => {
    await breakWritersScript();

    const { io } = await run("support-reply", ...samsEmail);

    const failed = io.stdout.findLastIndex((line) => line.startsWith("✕"));
    expect(io.stdout[failed + 1]).toMatch(/^ {2}Run it again with --debug/);
    expect(io.stderr).toEqual([]);
  });
});
