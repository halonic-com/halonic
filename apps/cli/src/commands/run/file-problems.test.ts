import { mkdtempSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
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

/**
 * Sends support-reply's spam through a step that calls a workflow `triage` of the support hub,
 * which runs Acme's sorter, so a broken `triage` is a file support-reply uses.
 */
async function callTriage(): Promise<void> {
  await writeFile(
    join(acme, "hubs/support/workflows/triage.workflow.yaml"),
    "id: triage\nname: Triage\ninitial: sort\nstates:\n  sort:\n    agent: sorter\n    on:\n      - to: done\n  done:\n    type: final\n",
  );
  const file = join(acme, "hubs/support/workflows/support-reply.workflow.yaml");
  const text = (await readFile(file, "utf8")).replace("- to: ignored", "- to: triage");
  await writeFile(
    file,
    `${text.trimEnd()}\n  triage:\n    type: workflow\n    workflow: triage\n    on:\n      - to: ignored\n`,
  );
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
      "✕ Couldn't run support-reply: Acme has 1 problem in providers/anthropic.yaml. Nothing ran.",
      "  See it with: halonic validate",
    ]);
    expect([...io.stdout, ...io.stderr].join("\n")).not.toContain(pastedKey);
    const listed = await new RunHistory(await openWorkspaceRuns(acme, profile)).listRuns();
    expect(listed.total).toBe(0);
  });

  it("keeps the user's --dir in the command it suggests", async () => {
    await pasteKeyIntoProvider(acme);
    const io = captureIo(folder);

    await runCli(["run", "support-reply", "--dir", "acme"], io, [runCommand()]);

    expect(io.stderr[1]).toBe(`  See it with: halonic validate --dir .${sep}acme`);
  });

  // HAL-14260: `validate` said "No problems" for these, and the run then
  // failed with exit 4 at its first model call.
  it.each([
    // One problem: the provider file's own; `models.yaml` doesn't repeat it.
    [
      "a provider type Halonic can't call",
      "providers/mock.yaml",
      "type: mock",
      "type: antropic",
      "1 problem in providers/mock.yaml",
    ],
    // One problem per hub whose workflow runs an agent without a model, on that
    // agent's file; only the support hub's stops support-reply (HAL-15127).
    [
      "a default alias no file has",
      "workspace.yaml",
      "model: default",
      "model: smart",
      "1 problem in hubs/support/agents/sorter.agent.yaml",
    ],
  ])("refuses %s before anything starts, as validate does", async (_, path, from, to, found) => {
    const file = join(acme, path);
    await writeFile(file, (await readFile(file, "utf8")).replace(from, to));
    const profile = freshProfile();
    const io = captureIo(acme);

    const code = await runCli(["run", "support-reply", ...samsEmail], io, [runCommand(profile)]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.slice(0, 2)).toEqual([
      `✕ Couldn't run support-reply: Acme has ${found}. Nothing ran.`,
      "  See it with: halonic validate",
    ]);
    const listed = await new RunHistory(await openWorkspaceRuns(acme, profile)).listRuns();
    expect(listed.total).toBe(0);
  });

  it("points at validate, not at a missing workflow, when the workflow's own file has an error", async () => {
    const file = join(acme, "hubs/support/workflows/support-reply.workflow.yaml");
    await writeFile(file, `version: 2\n${await readFile(file, "utf8")}`);
    const io = captureIo(acme);

    const code = await runCli(["run", "support-reply", ...samsEmail], io, [runCommand()]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.slice(0, 2)).toEqual([
      "✕ Couldn't run support-reply: Acme has 1 problem in hubs/support/workflows/support-reply.workflow.yaml. Nothing ran.",
      "  See it with: halonic validate",
    ]);
  });

  // C544-3 (HAL-15119, HAL-15127): Studio ran support-reply while the CLI
  // refused it for weekly-report, without saying which file stopped it.
  it("runs a workflow while only another workflow's file has an error, and refuses that one by its file", async () => {
    const file = join(acme, "hubs/reports/workflows/weekly-report.workflow.yaml");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace("agent: reporter", "agent: ghost"),
    );
    const profile = freshProfile();

    const ran = await runCli(["run", "support-reply", ...samsEmail], captureIo(acme), [
      runCommand(profile),
    ]);
    const io = captureIo(acme);
    const refused = await runCli(["run", "weekly-report"], io, [runCommand(profile)]);

    expect(ran).toBe(exitCode.ok);
    expect(refused).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe(
      "✕ Couldn't run weekly-report: Acme has 1 problem in hubs/reports/workflows/weekly-report.workflow.yaml. Nothing ran.",
    );
  });

  // C605 #1 (HAL-15637): a broken routine is the routine that can't start, not every workflow.
  it("runs the workflows while a paused routine starts support-reply without mail", async () => {
    const routines = join(acme, "hubs/support/workflows/routines");
    await mkdir(routines);
    await writeFile(
      join(routines, "nightly-check.routine.yaml"),
      'name: Nightly check\nenabled: false\ntrigger:\n  schedule: "0 2 * * *"\nrun:\n  workflow: support-reply\n',
    );
    const profile = freshProfile();

    const reply = await runCli(["run", "support-reply", ...samsEmail], captureIo(acme), [
      runCommand(profile),
    ]);
    const report = await runCli(["run", "weekly-report"], captureIo(acme), [runCommand(profile)]);

    expect(reply).toBe(exitCode.ok);
    expect(report).toBe(exitCode.ok);
  });

  // Without its settings, the workspace is named by its folder.
  it.each([
    ["workspace.yaml", "workspace.yaml", "acme"],
    ["its hub's file", "hubs/support/hub.yaml", "Acme"],
    ["another hub's file", "hubs/reports/hub.yaml", "Acme"],
    ["a workflow it calls", "hubs/support/workflows/triage.workflow.yaml", "Acme"],
  ])("refuses a run while %s has an error, naming it", async (_, path, name) => {
    await callTriage();
    const file = join(acme, path);
    await writeFile(file, `version: 2\n${await readFile(file, "utf8")}`);
    const io = captureIo(acme);

    const code = await runCli(["run", "support-reply", ...samsEmail], io, [runCommand()]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe(
      `✕ Couldn't run support-reply: ${name} has 1 problem in ${path}. Nothing ran.`,
    );
  });

  it("names the first file and counts the others when three files have errors", async () => {
    for (const path of [
      "hubs/support/workflows/support-reply.workflow.yaml",
      "hubs/support/hub.yaml",
    ]) {
      const file = join(acme, path);
      await writeFile(file, `version: 2\n${await readFile(file, "utf8")}`);
    }
    await pasteKeyIntoProvider(acme);
    const io = captureIo(acme);

    await runCli(["run", "support-reply", ...samsEmail], io, [runCommand()]);

    expect(io.stderr[0]).toMatch(
      /^✕ Couldn't run support-reply: Acme has 3 problems in \S+ and 2 other files\. Nothing ran\.$/,
    );
    // "See it with" is for one problem only (C591 row 17).
    expect(io.stderr[1]).toBe("  See them with: halonic validate");
    expect(io.stderr.join("\n")).not.toContain(pastedKey);
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
      "✕ Couldn't run support-reply: Acme has 1 problem in hubs/support/workflows/support-reply.workflow.yaml. Nothing ran.",
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
      "✕ Couldn't run announce: Acme has 1 problem in hubs/support/workflows/announce.workflow.yaml. Nothing ran.",
    );
    const listed = await new RunHistory(await openWorkspaceRuns(acme, profile)).listRuns();
    expect(listed.total).toBe(0);
  });
});

verifies("workspace.misplaced-files", () => {
  it("points at validate when the workflow's hub sits outside hubs/ (HAL-14297)", async () => {
    await rename(join(acme, "hubs/support"), join(acme, "support"));
    const io = captureIo(acme);

    const code = await runCli(["run", "support-reply", ...samsEmail], io, [runCommand()]);

    expect(code).toBe(exitCode.notFound);
    expect(io.stderr.slice(0, 2)).toEqual([
      '✕ There\'s no workflow called "support-reply" in Acme.',
      "  Halonic skipped 5 files in Acme for their folder or name. See them with: halonic validate",
    ]);
  });
});
