import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { smallWorkspace, validateIn, writeFiles } from "../../test/validate-workspace.ts";

const sheetFile = `integrations${sep}notes${sep}integration.yaml`;

let folder: string;
let workspace: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-integration-sheet-"));
  workspace = join(folder, "acme");
  // `validate` reads the plugins of this process's profile; keep it empty.
  vi.stubEnv("HALONIC_HOME", join(folder, "profile"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await removeTestFolder(folder);
});

/** The sheet of the integration `notes`, whose secret is placed `as`, or has no `as` when it is `null`. */
function notesSheet(as: string | null): string {
  const placed = as === null ? "" : `    as: ${as}\n`;
  return `id: notes
version: 0.1.0
kit: 1
provides: [connector]
hosts: [api.notes.example]
secrets:
  notes-key:
    purpose: Your notes account.
    hosts: [api.notes.example]
${placed}tools:
  - { name: find, description: Find a note., risk: read, untrusted: true }
`;
}

/** The small workspace, local only when `localOnly`, with a `local: true` connector to the integration in `integrations/notes`. */
function withNotes(sheet: string, localOnly: boolean): void {
  writeFiles(workspace, {
    ...smallWorkspace,
    "workspace.yaml": `id: acme\nname: Acme\nprivacy:\n  localOnly: ${localOnly}\n`,
    "library/connectors/notes.connector.yaml":
      "id: notes\nlocal: true\ntransport:\n  integration: { folder: notes }\n",
    "integrations/notes/integration.yaml": sheet,
    "integrations/notes/index.js": "export {};\n",
  });
}

verifies("cli.commands.validate.integration-sheet", () => {
  it("lists the sheet's own error on its file in a workspace that isn't local only", async () => {
    withNotes(notesSheet(null), false);

    const { code, io } = await validateIn(workspace, "--json");

    expect(code).toBe(exitCode.failed);
    const report = JSON.parse(io.stdout.join("\n")) as {
      problems: { file: string; line: number; severity: string }[];
    };
    expect(report.problems).toEqual([
      expect.objectContaining({ file: "integrations/notes/integration.yaml", severity: "error" }),
    ]);
    expect(report.problems[0]?.line).toBeGreaterThan(1);
  });

  it("gives a local-only workspace the sheet's error under the connector's", async () => {
    withNotes(notesSheet(null), true);

    const { code, io } = await validateIn(workspace);

    expect(code).toBe(exitCode.failed);
    const text = io.stdout.join("\n");
    expect(text).toContain("The sheet of the integration in integrations/notes can't be read");
    expect(io.stdout).toContain(sheetFile);
  });

  it("lists nothing for a sheet that parses", async () => {
    withNotes(notesSheet("bearer"), false);

    const { code, io } = await validateIn(workspace, "--json");

    expect(code).toBe(exitCode.ok);
    expect(JSON.parse(io.stdout.join("\n"))).toMatchObject({ errors: 0, problems: [] });
  });
});
