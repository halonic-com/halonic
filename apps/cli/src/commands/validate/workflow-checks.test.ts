import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { agent, smallWorkspace, validateIn, writeFiles } from "../../test/validate-workspace.ts";

// The checks `halonic validate` makes inside a workflow file, beyond its schema.

let folder: string;
/** The workspace folder, named `acme` so the summary names it the same on every computer. */
let acme: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-validate-workflows-"));
  acme = join(folder, "acme");
  writeFiles(acme, smallWorkspace);
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

verifies("workflow.validate-wait-signal", () => {
  // HAL-14310: the engine sends no signal from a wait step, so a routine on it would never start.
  it("stops a signal on a wait step at its line, with exit 1", async () => {
    writeFiles(acme, {
      ...agent("writer", "fast"),
      "hubs/support/workflows/review.workflow.yaml": [
        "id: review",
        "name: Review",
        "initial: draft",
        "states:",
        "  draft:",
        "    agent: writer",
        "    on: [{ to: check }]",
        "  check:",
        "    type: wait",
        "    signal: { name: review.done }",
        "    on: [{ to: sent, event: approve }]",
        "  sent:",
        "    type: final",
        "",
      ].join("\n"),
    });

    const { code, io } = await validateIn(acme);

    expect(code).toBe(exitCode.failed);
    expect(io.stdout.slice(1, 2)).toEqual([
      `  10:13  ✕ Wait step "check" can't send a signal. Put signal: on the step after it.  (wait-with-signal)`,
    ]);
  });
});

verifies("workflow.validate-input", () => {
  /** The Acme example's Support reply, with `change` made to its file. */
  function acmeWith(change: (text: string) => string): string {
    const copy = join(folder, "acme-example");
    cpSync(fileURLToPath(new URL("../../../../../examples/acme", import.meta.url)), copy, {
      recursive: true,
    });
    const file = join(copy, "hubs/support/workflows/support-reply.workflow.yaml");
    writeFileSync(file, change(readFileSync(file, "utf8")));
    return copy;
  }

  // C337 row 1 (HAL-14267): the run gave the agent "(not set)" while validate said "No problems".
  it("stops a gets of an input field the start form doesn't write, with exit 1", async () => {
    const { code, io } = await validateIn(
      acmeWith((text) => text.replace("gets: [input.mail]", "gets: [input.email]")),
    );

    expect(code).toBe(exitCode.failed);
    expect(io.stdout.slice(1, 2)).toEqual([
      '  11:12  ✕ "read" gets input.email, but the workflow\'s input has no field email. Did you mean input.mail?  (unknown-gets)',
    ]);
  });

  // C337 row 3: the start form (Studio, phone) would write a field no step reads.
  it("stops a start.field no step reads, once, with exit 1", async () => {
    const { code, io } = await validateIn(
      acmeWith((text) => text.replace("field: mail", "field: email")),
    );

    expect(code).toBe(exitCode.failed);
    expect(io.stdout.slice(1, 3)).toEqual([
      "  5:51  ✕ start.field is email, but no step reads input.email. The steps read input.mail: use that name as field, or add input.email to a step's gets.  (unread-start-field)",
      "",
    ]);
  });
});
