import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { validateCommand } from "./command.ts";

// A tool whose parameters don't match its action (HAL-18194): `pr_status` names its pull request
// `number`, but `github.pull-request` reads `pr`, so every call would fail.

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-validate-tool-parameters-"));
  await writeFile(join(folder, "workspace.yaml"), "id: acme\nname: Acme\n");
  await mkdir(join(folder, "library", "tools"), { recursive: true });
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** `halonic validate --dir` on the workspace with `pr_status` taking this parameter. */
async function validateWithParameter(parameter: string) {
  const tool = [
    "name: pr_status",
    "description: Reads one pull request.",
    `parameters: { ${parameter}: { type: integer, description: The pull request., required: true } }`,
    "callers: everyone",
    "action: { run: github.pull-request, with: { repositories: [acme/website] } }",
    "",
  ].join("\n");
  await writeFile(join(folder, "library", "tools", "pr-status.tool.yaml"), tool);
  const io = captureIo(folder);
  const code = await runCli(["validate", "--dir", folder], io, [validateCommand]);
  return { code, output: io.stdout.join("\n") };
}

verifies("cli.commands.validate.check-workspace", () => {
  it("fails a tool with number instead of pr, naming the tool and the missing pr", async () => {
    const { code, output } = await validateWithParameter("number");

    expect(code).toBe(exitCode.failed);
    expect(output).toContain("library/tools/pr-status.tool.yaml");
    expect(output).toMatch(/✕ The action github\.pull-request reads the parameter 'pr'/);
    expect(output).toContain("(parameter-missing)");
    expect(output).toContain("(parameter-not-read)");
  });

  it("passes the same tool once the parameter is pr", async () => {
    const { code, output } = await validateWithParameter("pr");

    expect(output).not.toContain("parameter-");
    expect(code).toBe(exitCode.ok);
  });
});
