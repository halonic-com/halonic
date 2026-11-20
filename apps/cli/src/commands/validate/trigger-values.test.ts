import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { validateCommand } from "./command.ts";

// A routine whose input names a value its trigger doesn't have, from Nina's check, C340 C30
// (HAL-14298): `validate` stops at its line instead of letting the run start blank.

let folder: string;
/** The workspace folder, named `acme` so the summary names it the same on every computer. */
let acme: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-validate-trigger-"));
  acme = join(folder, "acme");
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** A workspace with the reports hub, its Friday digest workflow and this routine file. */
function writeDigest(routine: string): void {
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "models.yaml": "aliases:\n  fast:\n    provider: mock\n    model: echo\n",
    "providers/mock.yaml": "type: mock\n",
    "hubs/reports/hub.yaml": "id: reports\nname: Reports\n",
    "hubs/reports/agents/reporter.agent.yaml":
      "id: reporter\nname: Reporter\nmodel: fast\ninstructions: Write.\n",
    "hubs/reports/workflows/digest.workflow.yaml": [
      "id: digest",
      "name: Friday digest",
      "initial: write",
      "states:",
      "  write:",
      "    agent: reporter",
      '    input: "Today is {{input.day}}."',
      "    on:",
      "      - to: done",
      "  done:",
      "    type: final",
      "",
    ].join("\n"),
    "hubs/reports/workflows/routines/digest.routine.yaml": routine,
  };
  for (const [name, text] of Object.entries(files)) {
    const path = join(acme, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
}

verifies("workspace.routine-start-checks", () => {
  it("stops at a trigger value the routine's trigger doesn't have, with its line", async () => {
    writeDigest(
      'name: Friday digest\ntrigger: { schedule: "0 16 * * 5" }\nrun:\n  workflow: digest\n  input: { day: "{{trigger.date}}" }\n',
    );
    const io = captureIo(acme);

    const code = await runCli(["validate"], io, [validateCommand]);

    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual([
      ["hubs", "reports", "workflows", "routines", "digest.routine.yaml"].join(sep),
      '  5:17  ✕ Routine "digest": {{trigger.date}} isn\'t a trigger value. Use {{trigger.at}} or {{trigger.lastRun}}.  (unknown-trigger-value)',
      "",
      "✕ 1 error in 1 file. Checked 7 files.",
    ]);
  });
});
