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

/** The Acme example, on the test model. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-setup-failure-"));
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

verifies("cli.run", () => {
  it("names for-each items that aren't a list as the input's mistake, with the fix, and exits 2 (HAL-14301)", async () => {
    await writeFile(
      join(acme, "hubs/support/workflows/many.workflow.yaml"),
      [
        "id: many",
        "name: Many",
        "description: Sorts each topic.",
        "initial: each",
        "states:",
        "  each:",
        "    type: foreach",
        '    items: "{{input.topics}}"',
        "    as: topic",
        "    agent: sorter",
        '    input: "{{topic}}"',
        "    on:",
        "      - to: done",
        "  done:",
        "    type: final",
        "",
      ].join("\n"),
    );
    const io = captureIo(acme);

    const code = await runCli(["run", "many", "--input", '{"topics":"Monday"}'], io, [
      runCommandWith(testRunSetup(folder, freshProfile())),
    ]);

    expect(code).toBe(exitCode.usage);
    const failed = io.stdout.findLastIndex((line) => line.startsWith("✕"));
    expect(io.stdout.slice(failed, failed + 2)).toEqual([
      "✕ Many failed in the step Each: its items ({{input.topics}}) are a text, not a list.",
      '  Pass a JSON list, such as ["Monday", "Tuesday"].',
    ]);
    expect(io.stdout.join("\n")).not.toContain("report it");
  });
});
