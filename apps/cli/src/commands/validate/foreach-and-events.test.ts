import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { announceFile, announceWorkflow } from "../../test/announce-workflow.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { validateCommand } from "./command.ts";

// The for-each, signal, event and agent mistakes of Nina's check, C340 rows 15–19 (HAL-14303),
// each on its own copy of Acme with one more workflow: `validate` names the line, and an error
// fails it. Before, each passed with no problem, and the run failed or sent an empty prompt.

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-validate-foreach-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** Acme with the announce workflow, one text in it replaced, then `halonic validate` on it. */
async function validateWith(from: string, to: string) {
  expect(announceWorkflow).toContain(from);
  await writeFile(join(acme, announceFile), announceWorkflow.replace(from, to));
  const io = captureIo(acme);
  const code = await runCli(["validate"], io, [validateCommand]);
  return { code, lines: io.stdout };
}

verifies("cli.commands.validate.check-workspace", () => {
  it("passes the sound workflow", async () => {
    const { code, lines } = await validateWith("", "");

    expect(code).toBe(exitCode.ok);
    expect(lines.at(-1)).toBe("✓ Checked 13 files in acme. No problems.");
  });

  it("fails {{item}} in a step that names its items topic, at its line (row 15)", async () => {
    const { code, lines } = await validateWith("Announce {{topic}}", "Announce {{item}}");

    expect(code).toBe(exitCode.failed);
    expect(lines[1]).toMatch(
      /^ {2}15:\d+ +✕ "each" uses \{\{item\}\}, but its items are named topic \(as: topic\)\. Write \{\{topic\}\}, or remove as: topic\./,
    );
    expect(lines[1]).toMatch(/ {2}\(unknown-item-name\)$/);
  });

  it("fails a misspelled name in a signal's data, at its line (row 15)", async () => {
    const { code, lines } = await validateWith(
      "    output: topics\n",
      '    output: topics\n    signal: { name: planned, data: { list: "{{context.topcs}}" } }\n',
    );

    expect(code).toBe(exitCode.failed);
    expect(lines[1]).toMatch(
      /^ {2}8:\d+ +✕ "plan" uses \{\{context\.topcs\}\}, .* Did you mean context\.topics\?/,
    );
    expect(lines[1]).toMatch(/ {2}\(unknown-template-name\)$/);
  });

  it("fails items that give nothing, at its line (row 16)", async () => {
    const { code, lines } = await validateWith('"{{context.topics}}"', '"{{topics}}"');

    expect(code).toBe(exitCode.failed);
    expect(lines[1]).toMatch(
      /^ {2}12:\d+ +✕ "each" goes through \{\{topics\}\}, which gives nothing\. Read the list from input or context/,
    );
    expect(lines[1]).toMatch(/ {2}\(items-not-a-list\)$/);
  });

  it("fails a task step whose only transition takes another event than done, at its line (row 17)", async () => {
    const { code, lines } = await validateWith(
      "      - to: each\n",
      "      - to: each\n        event: finished\n",
    );

    expect(code).toBe(exitCode.failed);
    expect(lines[1]).toMatch(
      /^ {2}10:\d+ +✕ "plan" ends with the event done, but its transitions only take finished\. Remove event: finished, or add a transition without event\./,
    );
    expect(lines[1]).toMatch(/ {2}\(no-done-transition\)$/);
  });

  it("fails a task step without an agent, worded like the run's cause, at its line (row 19)", async () => {
    const { code, lines } = await validateWith("  plan:\n    agent: writer\n", "  plan:\n");

    expect(code).toBe(exitCode.failed);
    expect(lines[1]).toMatch(
      /^ {2}6:\d+ +✕ Task "plan" names no agent, so every run fails there\. Give it an agent \(agent: <id>\), or make it a wait step\./,
    );
    expect(lines[1]).toMatch(/ {2}\(task-without-agent\)$/);
  });
});
