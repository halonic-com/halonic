import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { validateCommand } from "./command.ts";

// A step key the step's type ignores is a warning, not an error (HAL-14302).

let folder: string;
/** The workspace folder, named `acme` so the summary names it the same on every computer. */
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-ignored-keys-"));
  acme = join(folder, "acme");
  await writeFiles(acme, {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "models.yaml": "aliases:\n  fast:\n    provider: mock\n    model: echo\n",
    "providers/mock.yaml": "type: mock\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/agents/sorter.agent.yaml":
      "id: sorter\nname: sorter\nmodel: fast\ninstructions: Sort the mail.\n",
  });
});

afterEach(async () => {
  await removeTestFolder(folder);
});

async function writeFiles(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
}

verifies("workflow.validate-ignored-keys", () => {
  it("warns about an agent on a wait step at its line, and passes", async () => {
    await writeFiles(acme, {
      "hubs/support/workflows/sort.workflow.yaml": [
        "version: 1",
        "id: sort",
        "name: Sort",
        "initial: review",
        "states:",
        "  review:",
        "    type: wait",
        "    agent: sorter",
        "    on: [{ to: done, event: approve }]",
        "  done:",
        "    type: final",
        "",
      ].join("\n"),
    });

    const io = captureIo(acme);
    const code = await runCli(["validate"], io, [validateCommand]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      ["hubs", "support", "workflows", "sort.workflow.yaml"].join(sep),
      '  8:12  ! "review" is a wait step: agent is ignored. Put the agent on a task step before it.  (ignored-key)',
      "",
      "✓ Checked 6 files in acme. 1 warning.",
    ]);
  });
});
