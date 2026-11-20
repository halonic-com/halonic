import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { heavyTestTimeout } from "../../test/golden.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { validateCommand } from "./command.ts";

// The test-file mistakes of Nina's check on HAL-14257 (C337 rows 12–14) that
// `validate` passed as "No problems", each made on its own copy of Acme.

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const testFile = "hubs/support/workflows/support-reply.test.yaml";

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-acme-mistakes-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await removeTestFolder(folder);
});

async function validateAcme(): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acme);
  const code = await runCli(["validate"], io, [validateCommand]);
  return { code, io };
}

/** Replaces the first `from` in one of Acme's files. */
async function change(file: string, from: string, to: string): Promise<void> {
  const path = join(acme, file);
  const text = await readFile(path, "utf8");
  expect(text).toContain(from);
  await writeFile(path, text.replace(from, to));
}

/** The problem line for `file`: "  <line>:<col>  ✕ <message>  (<code>)". */
function problemAfter(io: CapturedIo, file: string): string | undefined {
  const at = io.stdout.indexOf(file.split("/").join(sep));
  return at === -1 ? undefined : io.stdout[at + 1];
}

verifies("workspace.test-references", () => {
  describe("a test file of the support-reply workflow", () => {
    it(
      "row 12: a mocked agent the workflow doesn't use fails with Did you mean, exit 1",
      async () => {
        await change(testFile, "      sorter: [refund]", "      soter: [refund]");

        const { code, io } = await validateAcme();

        expect(code).toBe(exitCode.failed);
        expect(problemAfter(io, testFile)).toMatch(
          /^ {2}10:\d+ +✕ The test mocks the agent soter, which the workflow doesn't use\. Did you mean sorter\? {2}\(unknown-mock-agent\)$/,
        );
      },
      heavyTestTimeout,
    );

    it(
      "row 13: a mocked reply that isn't one of sorter's options warns, exit 0",
      async () => {
        await change(testFile, "      sorter: [refund]", "      sorter: [questions]");

        const { code, io } = await validateAcme();

        expect(code).toBe(exitCode.ok);
        expect(problemAfter(io, testFile)).toMatch(
          /^ {2}10:\d+ +! The mocked reply "questions" isn't one of sorter's options, so the run fails at that step\. Use refund, question or spam\. {2}\(mock-not-an-option\)$/,
        );
      },
      heavyTestTimeout,
    );

    it(
      "row 14: an expect.final step the workflow doesn't have fails with Did you mean, exit 1",
      async () => {
        await change(testFile, "      final: ignored", "      final: ignore");

        const { code, io } = await validateAcme();

        expect(code).toBe(exitCode.failed);
        expect(problemAfter(io, testFile)).toMatch(
          /^ {2}\d+:\d+ +✕ expect\.final is "ignore", but the workflow has no step ignore\. Did you mean ignored\? {2}\(unknown-expected-step\)$/,
        );
      },
      heavyTestTimeout,
    );
  });
});
