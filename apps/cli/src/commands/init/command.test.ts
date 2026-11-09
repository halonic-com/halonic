import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { validateCommand } from "../validate/command.ts";
import { initCommand } from "./command.ts";

const golden = JSON.parse(
  readFileSync(join(import.meta.dirname, "golden", "init-output.json"), "utf8"),
);

const commands = [initCommand, validateCommand];

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-init-"));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** Every file under a folder with its text, by relative path. */
function filesIn(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(root).sort()) {
    files[name] = readFileSync(join(root, name), "utf8");
  }
  return files;
}

verifies("cli.commands.init.new-workspace", () => {
  it("gives the golden output and files in a new folder, which then validates", async () => {
    const io = captureIo(folder);
    expect(await runCli(["init", "acme-billing"], io, commands)).toBe(exitCode.ok);
    expect({
      stdout: io.stdout,
      stderr: io.stderr,
      files: filesIn(join(folder, "acme-billing")),
    }).toEqual(golden);

    const check = captureIo(folder);
    expect(await runCli(["validate", "acme-billing"], check, commands)).toBe(exitCode.ok);
    expect(check.stdout).toEqual(["OK: acme-billing, 0 hub(s), 0 warning(s)"]);
  }, 60_000);

  it("takes --name, makes the id from it and updates a .gitignore already there", async () => {
    writeFileSync(join(folder, ".gitignore"), "node_modules/\n");
    const io = captureIo(folder);
    expect(await runCli(["init", ".", "--name", "Acme Billing"], io, commands)).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "Updated .gitignore",
      "Created workspace.yaml",
      'Workspace "Acme Billing" (acme-billing) is ready.',
      "Check it with: halonic validate .",
    ]);
    expect(readFileSync(join(folder, ".gitignore"), "utf8")).toBe("node_modules/\n.env\n.env.*\n");
  });

  it("leaves a workspace alone and exits with 1", async () => {
    mkdirSync(join(folder, "acme"));
    writeFileSync(join(folder, "acme", "workspace.yaml"), "id: old\nname: Old\n");
    const io = captureIo(folder);
    expect(await runCli(["init", "acme"], io, commands)).toBe(exitCode.failed);
    expect(io.stderr).toEqual(["acme is already a workspace: it has a workspace.yaml."]);
    expect(filesIn(join(folder, "acme"))).toEqual({ "workspace.yaml": "id: old\nname: Old\n" });
  });

  it("refuses an id the workspace kind doesn't allow, writing nothing", async () => {
    const io = captureIo(folder);
    expect(await runCli(["init", "acme", "--id", "Acme"], io, commands)).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      "The workspace settings won't do. id: use lowercase letters, digits, '-' or '_'",
      "Usage: halonic init <dir> [--name <name>] [--id <id>]",
    ]);
    expect(readdirSync(folder)).toEqual([]);
  });

  it("refuses no folder", async () => {
    const io = captureIo(folder);
    expect(await runCli(["init"], io, commands)).toBe(exitCode.usage);
  });
});
