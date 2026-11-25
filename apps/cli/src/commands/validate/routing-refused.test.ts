import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { smallWorkspace, validateIn, writeFiles } from "../../test/validate-workspace.ts";

let folder: string;
let workspace: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-routing-refused-"));
  workspace = join(folder, "acme");
  vi.stubEnv("HALONIC_HOME", join(folder, "profile"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await removeTestFolder(folder);
});

/** The small workspace with a `routing.yaml` holding `lines`. */
function withRouting(...lines: string[]): void {
  writeFiles(workspace, { ...smallWorkspace, "routing.yaml": `${lines.join("\n")}\n` });
}

verifies("cli.commands.validate.routing-refused", () => {
  it.each([
    ["an email", ["roles:", "  code-reviewer: liam@example.com"]],
    ["an unknown role", ["roles:", "  approver: liam"]],
    ["an area named like an account", ["areas:", "  github-login: liam"]],
  ])("refuses a routing.yaml with %s", async (_, lines) => {
    withRouting(...lines);

    const { code, io } = await validateIn(workspace);

    expect(code).toBe(exitCode.failed);
    expect(io.stdout.join("\n")).toContain("routing.yaml");
  });

  it("passes a routing.yaml that names agents by their url key", async () => {
    withRouting("roles:", "  code-reviewer: liam", "areas:", "  engine-and-cli: priya");

    const { code, io } = await validateIn(workspace);

    expect(code, io.stdout.join("\n")).toBe(exitCode.ok);
  });
});
