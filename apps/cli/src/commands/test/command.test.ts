import { appendFile, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { goldenText, runGolden } from "../../test/golden.ts";
import { checklistProblems } from "../../test/golden-checklist.ts";
import { testCommandWith } from "./command.ts";

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const testFile = "hubs/support/workflows/support-reply.test.yaml";

let folder: string;
/** A copy of the acme example, whose five tests pass. */
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-test-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** A clock that never moves, so every test takes 0.0 s on every computer. */
const commands = () => [testCommandWith({ clock: fixedClock(Date.UTC(2026, 10, 11), 0) })];

async function testIn(cwd: string, ...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(cwd);
  const code = await runCli(["test", ...args], io, commands());
  return { code, io };
}

/** Adds a case to acme's test file that expects spam to get a reply and its kind to be "refund". */
async function addFailingCase(): Promise<void> {
  await appendFile(
    join(acme, testFile),
    [
      "",
      "  - name: Spam gets a reply",
      '    input: { mail: "You have won a prize!" }',
      "    mocks: { writer: [Someone says we won a prize.], sorter: [spam] }",
      "    expect:",
      "      final: replied",
      "      context: { kind: refund }",
      "",
    ].join("\n"),
  );
}

verifies("cli.commands.test.run-tests", () => {
  describe("the report", () => {
    it("runs acme's five tests, says they passed and exits 0", async () => {
      const { code, io } = await testIn(acme);

      expect(code).toBe(exitCode.ok);
      expect(io.stdout[0]).toBe("Testing acme with the test model. Nothing is sent anywhere.");
      expect(io.stdout.filter((line) => line.startsWith("✓ support-reply › "))).toHaveLength(5);
      expect(io.stdout.at(-1)).toBe("✓ 5 tests passed in 0.0 s.");
      expect(io.stderr).toEqual([]);
    });

    it("says what a failed test expected and where it is, and exits 1", async () => {
      await addFailingCase();

      const { code, io } = await testIn(acme);

      expect(code).toBe(exitCode.failed);
      const failed = io.stdout.findIndex((line) => line.startsWith("✕ "));
      expect(io.stdout[failed]).toMatch(/^✕ support-reply › Spam gets a reply {3,}0\.0 s$/u);
      expect(io.stdout.slice(failed + 1, failed + 4)).toEqual([
        "    Expected the run to end in the step Finished with the reply approved, but it ended in Finished without a reply, because nobody needs to answer spam.",
        '    Expected kind to be "refund" when the run ended, but it was "spam".',
        `    ${join("hubs", "support", "workflows", "support-reply.test.yaml")}:68`,
      ]);
      expect(io.stdout.at(-1)).toBe("✕ 5 passed, 1 failed. 6 tests in 0.0 s.");
    });

    it("runs only the tests whose hub/workflow/name contains --filter", async () => {
      const { code, io } = await testIn(acme, "--filter", "support/support-reply/Alex");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout.filter((line) => line.startsWith("✓ "))).toEqual([
        expect.stringMatching(/^✓ support-reply › Alex's threat is rejected and gets no reply/u),
        "✓ 1 test passed in 0.0 s.",
      ]);
    });

    it("stops with exit 2 when --filter matches no test, with the user's --dir", async () => {
      const { code, io } = await testIn(folder, "--dir", "acme", "--filter", "refnd");

      expect(code).toBe(exitCode.usage);
      expect(io.stderr.slice(0, 2)).toEqual([
        '✕ No tests match "refnd".',
        `  Run halonic test --dir .${sep}acme --list to see them all.`,
      ]);
    });

    it("lists the tests without running them", async () => {
      const { code, io } = await testIn(acme, "--list", "--filter", "Spam");

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        `support-reply › Spam ends without a draft or a review   ${join("hubs", "support", "workflows", "support-reply.test.yaml")}:57`,
        "",
        "1 test in acme.",
      ]);
    });

    it("says a workspace without tests has none yet, and exits 0", async () => {
      await rm(join(acme, testFile));

      const { code, io } = await testIn(acme);

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "! acme has no workflow tests yet.",
        "  Add one next to a workflow as <workflow>.test.yaml.",
      ]);
    });

    it("stops with exit 4 in a folder without workspace.yaml", async () => {
      const { code, io } = await testIn(folder);

      expect(code).toBe(exitCode.notFound);
      expect(io.stderr[0]).toMatch(/^✕ Couldn't test .+: there's no workspace\.yaml here\.$/u);
    });
  });

  describe("golden output", () => {
    const golden = async (name: string, args: readonly string[]) => {
      const run = await runGolden(args, commands, acme);
      expect(checklistProblems(run, { reportOnStdout: true })).toEqual([]);
      await expect(goldenText(args, run)).toMatchFileSnapshot(join("golden", `${name}.txt`));
    };

    it("when every test passes", async () => {
      await golden("all-passed", ["test"]);
    });

    it("when a test fails", async () => {
      await addFailingCase();
      await golden("one-failed", ["test"]);
    });

    it("for --list", async () => {
      await golden("list", ["test", "--list"]);
    });
  });
});
