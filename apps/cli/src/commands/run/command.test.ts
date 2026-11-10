import { mkdtempSync } from "node:fs";
import { chmod, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RunHistory } from "@halonicjs/app";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliCommand } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { goldenText, runGolden } from "../../test/golden.ts";
import { checklistProblems } from "../../test/golden-checklist.ts";
import { testRunSetup } from "../../test/run-setup.ts";
import { nodeProfileEnvironment, openWorkspaceRuns } from "../../workspace-runs.ts";
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
  await rm(folder, { recursive: true, force: true });
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

verifies("cli.run", () => {
  it.skipIf(process.platform === "win32")(
    "[platform:win32] HAL-4406: follows Support reply until it waits for the reply's approval, in every mode",
    async () => {
      const args = ["run", "support-reply", ...samsEmail];
      const output = await runGolden(args, () => [runCommand()], acme);

      expect(output.noColour.exit).toBe(exitCode.ok);
      expect(checklistProblems(output)).toEqual([]);
      expect(goldenText(args, output)).toBe(
        await readFile(golden("support-reply-waiting.txt"), "utf8"),
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "[platform:win32] HAL-4406: answers the wait with --event and ends with the receipt",
    async () => {
      const args = ["run", "support-reply", ...samsEmail, "--event", "approve"];
      const output = await runGolden(args, () => [runCommand()], acme);

      expect(output.noColour.exit).toBe(exitCode.ok);
      expect(checklistProblems(output)).toEqual([]);
      expect(goldenText(args, output)).toBe(
        await readFile(golden("support-reply-approved.txt"), "utf8"),
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "[platform:win32] HAL-4406: says which --event the run ended before it took",
    async () => {
      const { code, io } = await run(
        "support-reply",
        ...samsEmail,
        "--event",
        "approve",
        "--event",
        "reject",
      );

      expect(code).toBe(exitCode.ok);
      expect(io.stdout.slice(-2)).toEqual([
        "",
        "! Didn't use --event reject: the run ended first.",
      ]);
    },
  );

  it.skipIf(process.platform === "win32")(
    "[platform:win32] HAL-4406: keeps the run where halonic runs reads it",
    async () => {
      const profile = freshProfile();
      const io = captureIo(acme);
      await runCli(["run", "support-reply", ...samsEmail], io, [runCommand(profile)]);

      const listed = await new RunHistory(await openWorkspaceRuns(acme, profile)).listRuns();
      expect(listed.runs.map((each) => [each.workflowId, each.status])).toEqual([
        ["support-reply", "waiting"],
      ]);
    },
  );

  it.skipIf(process.platform === "win32")(
    "[platform:win32] HAL-4406: refuses an event the wait doesn't take, with the one that's close",
    async () => {
      const { code, io } = await run("support-reply", ...samsEmail, "--event", "aprove");

      expect(code).toBe(exitCode.usage);
      expect(io.stderr).toEqual([
        "✕ Couldn't send aprove to run 01jd8q: the step Approve this reply? takes approve or reject.",
        "  Did you mean approve?",
      ]);
    },
  );

  it.skipIf(process.platform === "win32")(
    "[platform:win32] HAL-4406: ends a failed run with its two lines and exit 1",
    async () => {
      // Writer's model alias isn't in the workspace, so the first step's model call fails.
      const writer = join(acme, "hubs/support/agents/writer.agent.yaml");
      await writeFile(writer, `${await readFile(writer, "utf8")}model: gone\n`);

      const { code, io } = await run("support-reply", ...samsEmail);

      expect(code).toBe(exitCode.failed);
      const failed = io.stdout.findLastIndex((line) => line.startsWith("✕"));
      expect(io.stdout[failed]).toMatch(
        /^✕ Support reply failed in the step Read the email\. Halonic can't tell the cause yet: /,
      );
      // The fix, then the receipt, as `halonic runs show` ends the same run.
      expect(io.stdout.slice(failed + 1).map((line) => line.startsWith("  "))).toEqual([
        true,
        true,
      ]);
    },
  );
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
      '✕ There\'s no workflow called "suport-reply" in acme.',
      "  Did you mean support-reply?",
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
});
