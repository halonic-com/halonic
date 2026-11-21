// `halonic validate` on a copy of the Acme example with one change: the input
// a routine gives its workflow.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { validateIn } from "../../test/validate-workspace.ts";

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-validate-routine-input-"));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** A copy of the Acme example, with each change made to the file it names. */
function acmeWith(changes: Readonly<Record<string, (text: string) => string>>): string {
  const copy = join(folder, "acme-example");
  cpSync(fileURLToPath(new URL("../../../../../examples/acme", import.meta.url)), copy, {
    recursive: true,
  });
  for (const [path, change] of Object.entries(changes)) {
    const file = join(copy, path);
    writeFileSync(file, change(readFileSync(file, "utf8")));
  }
  return copy;
}

verifies("workspace.routine-input", () => {
  // C340 row 10 (HAL-14316): the routine ran with "Today is ." while validate said "No problems".
  it("warns at a routine input key the workflow doesn't read", async () => {
    const { code, io } = await validateIn(
      acmeWith({
        "hubs/reports/workflows/weekly-report.workflow.yaml": (text) =>
          text.replace("Write this week's report.", "Write the report. Today is {{input.day}}."),
        "hubs/reports/workflows/routines/weekly-report.routine.yaml": (text) =>
          `${text}  input: { dya: "{{trigger.at}}" }\n`,
      }),
    );

    // The first step reads input.day, which the routine doesn't give (HAL-14777), so it fails.
    expect(code).toBe(exitCode.failed);
    expect(io.stdout.slice(0, 3)).toEqual([
      join("hubs", "reports", "workflows", "routines", "weekly-report.routine.yaml"),
      "  7:10  ✕ Weekly report starts weekly-report without day, which its first step reads. Add day under run.input.  (missing-routine-input)",
      '  7:17  ! Routine "weekly-report": workflow "weekly-report" doesn\'t read input.dya. Did you mean input.day?  (unread-routine-input)',
    ]);
  });
});

verifies("workspace.routine-start-input", () => {
  // C480 P5 (HAL-14777): the routine started with "Today is ." every week, unwatched.
  it("fails a routine with no input for a field its workflow's first step reads", async () => {
    const { code, io } = await validateIn(
      acmeWith({
        "hubs/reports/workflows/weekly-report.workflow.yaml": (text) =>
          text.replace("Write this week's report.", "Write the report. Today is {{input.day}}."),
      }),
    );

    expect(code).toBe(exitCode.failed);
    expect(io.stdout.slice(0, 2)).toEqual([
      join("hubs", "reports", "workflows", "routines", "weekly-report.routine.yaml"),
      "  5:1  ✕ Weekly report starts weekly-report without day, which its first step reads. Add day under run.input.  (missing-routine-input)",
    ]);
  });
});
