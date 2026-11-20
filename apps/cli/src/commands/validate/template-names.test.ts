import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { validateCommand } from "./command.ts";

// The template and condition mistakes of Nina's check, C337 rows 4–6 (HAL-14268), each on its own
// copy of Acme: `validate` names the line, and an error fails it.

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const workflowFile = "hubs/support/workflows/support-reply.workflow.yaml";

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-validate-templates-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** Acme's support reply with one text replaced, then `halonic validate` on it. */
async function validateWith(from: string, to: string) {
  const file = join(acme, workflowFile);
  const text = await readFile(file, "utf8");
  expect(text).toContain(from);
  await writeFile(file, text.replace(from, to));
  const io = captureIo(acme);
  const code = await runCli(["validate"], io, [validateCommand]);
  return { code, lines: io.stdout };
}

verifies("cli.commands.validate.check-workspace", () => {
  it("fails a misspelled name in a condition, at its line, with the near name (row 4)", async () => {
    const { code, lines } = await validateWith("{{context.kind}}", "{{context.knd}}");

    expect(code).toBe(exitCode.failed);
    expect(lines[1]).toMatch(
      /^ {2}22:\d+ +✕ "classify" uses \{\{context\.knd\}\}, but no earlier step writes context\.knd\. Did you mean context\.kind\?/,
    );
    expect(lines[1]).toMatch(/ {2}\(unknown-template-name\)$/);
  });

  it("fails a misspelled name in a wait step's description, at its line (row 5)", async () => {
    const { code, lines } = await validateWith("{{context.reply}}", "{{context.replly}}");

    expect(code).toBe(exitCode.failed);
    expect(lines[1]).toMatch(
      /^ {2}37:\d+ +✕ "review" uses \{\{context\.replly\}\}, .* Did you mean context\.reply\?/,
    );
    expect(lines[1]).toMatch(/ {2}\(unknown-template-name\)$/);
  });

  it("warns, and passes, when a condition compares the sorter's choice with no option of it (row 6)", async () => {
    const { code, lines } = await validateWith("spam] }", "junk] }");

    expect(code).toBe(exitCode.ok);
    expect(lines[1]).toMatch(
      /^ {2}22:\d+ +! "classify" compares context\.kind with "junk", but the agent sorter only answers refund, question or spam\./,
    );
    expect(lines[1]).toMatch(/ {2}\(not-a-choice\)$/);
    expect(lines.at(-1)).toBe("✓ Checked 12 files in acme. 1 warning.");
  });
});
