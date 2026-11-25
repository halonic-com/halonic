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

/** `halonic validate --dir` on the workspace with this one tool file. */
async function validateWithTool(file: string, lines: readonly string[]) {
  await writeFile(join(folder, "library", "tools", file), [...lines, ""].join("\n"));
  const io = captureIo(folder);
  const code = await runCli(["validate", "--dir", folder], io, [validateCommand]);
  return { code, output: io.stdout.join("\n") };
}

/** `halonic validate --dir` on the workspace with `pr_status` taking this parameter. */
function validateWithParameter(parameter: string, required = true) {
  return validateWithTool("pr-status.tool.yaml", [
    "name: pr_status",
    "description: Reads one pull request.",
    `parameters: { ${parameter}: { type: integer, description: The pull request., required: ${required} } }`,
    "callers: everyone",
    "action: { run: github.pull-request, with: { repositories: [acme/website] } }",
  ]);
}

verifies("cli.commands.validate.check-workspace", () => {
  it("fails a tool with number instead of pr, naming the tool and the missing pr", async () => {
    const { code, output } = await validateWithParameter("number");

    expect(code).toBe(exitCode.failed);
    expect(output).toContain(join("library", "tools", "pr-status.tool.yaml"));
    expect(output).toMatch(/✕ The action github\.pull-request reads the parameter 'pr'/);
    expect(output).toContain("(parameter-missing)");
    expect(output).toContain("(parameter-not-read)");
  });

  it("passes the same tool once the parameter is pr", async () => {
    const { code, output } = await validateWithParameter("pr");

    expect(output).not.toContain("parameter-");
    expect(code).toBe(exitCode.ok);
  });

  it("fails a pull-request tool that declares pr as optional, naming the tool and pr", async () => {
    const { code, output } = await validateWithParameter("pr", false);

    expect(code).toBe(exitCode.failed);
    expect(output).toContain(join("library", "tools", "pr-status.tool.yaml"));
    expect(output).toMatch(/✕ The action github\.pull-request can't run without 'pr'/);
    expect(output).toContain("(parameter-optional)");
  });

  it("passes a next-step tool with monitor as an object and blockedBy as a list", async () => {
    const { code, output } = await validateWithTool("set-next-step.tool.yaml", [
      "name: set_next_step",
      "description: Keeps the caller's task in a state Paperclip accepts.",
      "parameters:",
      "  task: { type: string, description: The task., required: true }",
      "  status: { type: string, description: The next state., required: true }",
      "  comment: { type: string, description: What happened., required: true }",
      "  monitor:",
      "    type: object",
      "    description: When to wake you.",
      "    fields:",
      "      inMinutes: { type: integer, description: Minutes until the check., required: true }",
      "      ref: { type: string, description: What you wait on., required: true }",
      "  blockedBy: { type: list, description: The tasks that hold the work., items: { type: string } }",
      "callers: everyone",
      "action: { run: paperclip.next-step }",
    ]);

    expect(output).not.toContain("parameter-");
    expect(code).toBe(exitCode.ok);
  });
});
