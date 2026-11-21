import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateCommand } from "../commands/validate/command.ts";
import { runCli } from "../run-cli.ts";
import { type CapturedIo, captureIo } from "./capture-io.ts";

/** The files of the smallest workspace `halonic validate` passes: three files, no problems. */
export const smallWorkspace: Readonly<Record<string, string>> = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "models.yaml": "aliases:\n  fast:\n    provider: mock\n    model: echo\n",
  "providers/mock.yaml": "type: mock\n",
};

/** Writes each file under `root`, making its folders first. */
export function writeFiles(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

/** An agent in the support hub that names the model alias `model`. */
export function agent(id: string, model: string): Readonly<Record<string, string>> {
  return {
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    [`hubs/support/agents/${id}.agent.yaml`]: `id: ${id}\nname: ${id}\nmodel: ${model}\ninstructions: Sort the mail.\n`,
  };
}

/** Runs `halonic validate` with `args` in `cwd`. */
export async function validateIn(
  cwd: string,
  ...args: string[]
): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(cwd);
  const code = await runCli(["validate", ...args], io, [validateCommand]);
  return { code, io };
}
