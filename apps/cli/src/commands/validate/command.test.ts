import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeWorkspace, type Recording, readCase } from "@halonicjs/testing-parity";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { validateCommand } from "./command.ts";

/** The parity package's made-up fixtures, with the old `studio validate`'s recorded output. */
const parityFixtures = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "packages",
  "testing",
  "parity",
  "fixtures",
);

/** What `halonic validate` printed and returned, by parity case. */
type ValidateOutput = { readonly exitCode: number; readonly stdout: string };

const golden: Record<string, ValidateOutput> = JSON.parse(
  readFileSync(join(import.meta.dirname, "golden", "validate-output.json"), "utf8"),
);

/**
 * The cases where the new output is the old one, line for line. The others
 * differ in what the loader finds, not in the format: workflow and routine
 * checks aren't in the loader yet (HAL-186), and shared connectors now live
 * under `library/`. Item 9 of the HAL-187 plan lists those differences.
 */
const sameAsOld = [
  "base",
  "agent/delegation-loop",
  "agent/unknown-skill",
  "workspace/missing-file",
  "workspace/yaml-syntax",
];

/** Loading one workspace takes seconds on the agent runner and far more under a full verify. */
const loadLimitMs = 120_000;

let folder: string;

beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-validate-"));
});

afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** Writes a parity case to its own folder and runs `halonic validate` on it. */
async function validateCase(id: string): Promise<ValidateOutput> {
  const caseFolder =
    id === "base" ? join(parityFixtures, "base") : join(parityFixtures, "cases", id);
  const target = id.replace("/", "-");
  composeWorkspace(parityFixtures, readCase(id, caseFolder), join(folder, target));
  const io = captureIo(folder);
  const code = await runCli(["validate", target], io, [validateCommand]);
  expect(io.stderr).toEqual([]);
  return { exitCode: code, stdout: io.stdout.map((line) => `${line}\n`).join("") };
}

verifies("cli.commands.validate.old-output", () => {
  describe.each(Object.keys(golden))("parity case %s", (id) => {
    it(
      "gives the golden output",
      async () => {
        const output = await validateCase(id);
        expect(output).toEqual(golden[id]);
        if (sameAsOld.includes(id)) {
          const caseFolder = id === "base" ? "base" : join("cases", id);
          const recorded: Recording = JSON.parse(
            readFileSync(join(parityFixtures, caseFolder, "recorded.json"), "utf8"),
          );
          expect(output).toEqual({
            exitCode: recorded.validate.exitCode,
            stdout: recorded.validate.stdout,
          });
        }
      },
      loadLimitMs,
    );
  });

  it("refuses no folder and two folders", async () => {
    for (const args of [["validate"], ["validate", "a", "b"]]) {
      const io = captureIo(folder);
      expect(await runCli(args, io, [validateCommand])).toBe(exitCode.usage);
      expect(io.stderr).toEqual(["Give one workspace folder.", "Usage: halonic validate <dir>"]);
    }
  });
});
