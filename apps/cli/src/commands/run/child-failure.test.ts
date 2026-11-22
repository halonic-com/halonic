import { mkdtempSync } from "node:fs";
import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { testRunSetup } from "../../test/run-setup.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { runCommandWith } from "./command.ts";

// `halonic run` ends a run whose step failed because the child run it
// started failed with the child's cause, as `runs show` does (HAL-15555).

/** The Acme example, on the test model. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-child-failure-"));
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

/** Many: Sort one for each topic. */
const many = [
  "id: many",
  "name: Many",
  "initial: each",
  "states:",
  "  each:",
  "    type: foreach",
  '    items: "{{input.topics}}"',
  "    as: topic",
  "    workflow: sort-one",
  "    on:",
  "      - to: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

/** Sort one: a for-each over its topic, which is a text, so its run fails. */
const sortOne = [
  "id: sort-one",
  "name: Sort one",
  "initial: words",
  "states:",
  "  words:",
  "    description: Each word",
  "    type: foreach",
  '    items: "{{input.topic}}"',
  "    agent: sorter",
  "    on:",
  "      - to: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

verifies("cli.run-failed-child", () => {
  it("says the child run's cause on the run's line, its fix and the way to it", async () => {
    await writeFile(join(acme, "hubs/support/workflows/many.workflow.yaml"), many);
    await writeFile(join(acme, "hubs/support/workflows/sort-one.workflow.yaml"), sortOne);
    const io = captureIo(acme);

    const code = await runCli(["run", "many", "--input", '{"topics":["Monday"]}'], io, [
      runCommandWith(testRunSetup(folder, freshProfile())),
    ]);

    expect(code).toBe(exitCode.failed);
    const failed = io.stdout.findLastIndex((line) => line.startsWith("✕"));
    expect(io.stdout.slice(failed, failed + 3)).toEqual([
      "✕ Many failed in the step Each because the run it started for item 1 failed in the step Each word: its items ({{input.topic}}) are a text, not a list.",
      '  Pass a JSON list, such as ["Monday", "Tuesday"].',
      // The child's short id starts with the run's own; item 1 is the
      // step's first item, index 0 in the id.
      expect.stringMatching(/^ {2}See that run with halonic runs show [0-9a-z]{6}\.\d+\.0\.$/),
    ]);
    const heading = io.stdout.find((line) => line.startsWith("Running Many"));
    const runShortId = heading?.match(/· run (\S+)$/u)?.[1];
    expect(io.stdout[failed + 2]).toContain(`runs show ${runShortId}.`);
  });
});
