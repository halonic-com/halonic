import { mkdtempSync } from "node:fs";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { RunHistory } from "@halonicjs/app";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { CliCommand } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { announceFile, announceWorkflow } from "../../test/announce-workflow.ts";
import { captureIo } from "../../test/capture-io.ts";
import { pastedKey, pasteKeyIntoProvider } from "../../test/pasted-key.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { testRunSetup } from "../../test/run-setup.ts";
import { nodeProfileEnvironment, openWorkspaceRuns } from "../../workspace-runs.ts";
import { runCommandWith } from "./command.ts";

/** The Acme example, on the test model. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const samsEmail = ["--input", "examples/refund-question.json"];

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-file-problems-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
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

  it("points at validate, not at a missing workflow, when the workflow's own file has an error", async () => {
    const file = join(acme, "hubs/support/workflows/support-reply.workflow.yaml");
    await writeFile(file, `version: 2\n${await readFile(file, "utf8")}`);
    const io = captureIo(acme);

    const code = await runCli(["run", "support-reply", ...samsEmail], io, [runCommand()]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.slice(0, 2)).toEqual([
      "✕ Couldn't run support-reply: Acme has 1 problem in its files. Nothing ran.",
      "  See them with: halonic validate",
    ]);
  });

  // C337 row 4 (HAL-14268): a misspelled name in a condition used to run, and send spam to a draft.
  it("stops before a run whose condition reads a context name no step writes", async () => {
    const file = join(acme, "hubs/support/workflows/support-reply.workflow.yaml");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace("{{context.kind}}", "{{context.knd}}"),
    );
    const profile = freshProfile();
    const io = captureIo(acme);

    const code = await runCli(["run", "support-reply", ...samsEmail], io, [runCommand(profile)]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe(
      "✕ Couldn't run support-reply: Acme has 1 problem in its files. Nothing ran.",
    );
    const listed = await new RunHistory(await openWorkspaceRuns(acme, profile)).listRuns();
    expect(listed.total).toBe(0);
  });

  // C340 row 15 (HAL-14303): with as: topic, {{item}} used to run and send each item's agent "Announce ".
  it("stops before a for-each run whose prompt reads an item name it doesn't have", async () => {
    await writeFile(
      join(acme, announceFile),
      announceWorkflow.replace("Announce {{topic}}", "Announce {{item}}"),
    );
    const profile = freshProfile();
    const io = captureIo(acme);

    const code = await runCli(["run", "announce"], io, [runCommand(profile)]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe(
      "✕ Couldn't run announce: Acme has 1 problem in its files. Nothing ran.",
    );
    const listed = await new RunHistory(await openWorkspaceRuns(acme, profile)).listRuns();
    expect(listed.total).toBe(0);
  });
});
