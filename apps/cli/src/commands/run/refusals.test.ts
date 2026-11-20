import { mkdtempSync } from "node:fs";
import { chmod, cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RunHistory } from "@halonicjs/app";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliCommand } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { turnOffLocalOnly } from "../../test/local-only.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { testRunSetup } from "../../test/run-setup.ts";
import { leakedAddressParts, userInfoConnectorYaml } from "../../test/user-info-connector.ts";
import { nodeProfileEnvironment, openWorkspaceRuns } from "../../workspace-runs.ts";
import { runCommandWith } from "./command.ts";

// `halonic run`'s refusals: what it says, and that it starts nothing, when the
// workflow, the input or the workspace's trust is wrong. Moved out of
// command.test.ts to keep that file under the line limit (HAL-14115).

/** The Acme example, on the test model. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-refusals-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  // Backstop: the engine is closed by now, but a slow runner may still be finishing a file.
  await removeTestFolder(folder);
});

/** A profile folder of its own, so each test starts with no runs. */
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
