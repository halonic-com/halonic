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

// Workspace settings Halonic ignores are warnings, not errors (HAL-14302).

let folder: string;
/** The workspace folder, named `acme` so the summary names it the same on every computer. */
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-ignored-settings-"));
  acme = join(folder, "acme");
  await writeFiles(acme, {
    "models.yaml": "aliases:\n  fast:\n    provider: mock\n    model: echo\n",
    "providers/mock.yaml": "type: mock\n",
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

verifies("workspace.ignored-settings", () => {
  it("warns about a runtime it ignores and instructions that name a file, and passes", async () => {
    await writeFiles(acme, {
      "workspace.yaml": "id: acme\nname: Acme\ndefaults:\n  runtime: docker\n",
      "agents/announcer.agent.yaml": "name: Announcer\ninstructions: ./announcer.md\n",
      "agents/announcer.md": "Announce the news.\n",
    });

    const io = captureIo(acme);
    const code = await runCli(["validate"], io, [validateCommand]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      ["agents", "announcer.agent.yaml"].join(sep),
      `  2:15  ! instructions is the text "./announcer.md". Paste the instructions here; Halonic doesn't read files from instructions.  (instructions-file-name)`,
      "",
      "workspace.yaml",
      '  4:12  ! Runtime "docker" isn\'t one Halonic has; it runs inprocess. Remove defaults.runtime, or set it to inprocess.  (unknown-runtime)',
      "",
      "✓ Checked 4 files in acme. 2 warnings.",
    ]);
  });
});
