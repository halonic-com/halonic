import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  commandExportName,
  generatedCommandsFile,
  listCommandFolders,
  renderCommandsFile,
  writeCommandsFile,
} from "./cli-commands.ts";

describe("commandExportName", () => {
  it("turns a folder name into the command's export name", () => {
    expect(commandExportName("schema")).toBe("schemaCommand");
    expect(commandExportName("run-tests")).toBe("runTestsCommand");
  });
});

describe("renderCommandsFile", () => {
  it("imports every command and lists them in order", () => {
    const text = renderCommandsFile(["schema", "validate"]);
    expect(text).toContain('import { schemaCommand } from "../commands/schema/command.ts";');
    expect(text).toContain('import { validateCommand } from "../commands/validate/command.ts";');
    expect(text).toContain("readonly CliCommand[] = [schemaCommand, validateCommand];");
  });

  it("produces a typed empty list when there are no commands", () => {
    expect(renderCommandsFile([])).toContain("readonly CliCommand[] = [];");
  });
});

describe("listCommandFolders and writeCommandsFile", () => {
  let root: string;
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const addCommand = (name: string): void => {
    write(`apps/cli/src/commands/${name}/command.ts`, "");
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "halonic-discover-cli-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("lists only folders with a command.ts, sorted", () => {
    addCommand("validate");
    addCommand("schema");
    write("apps/cli/src/commands/shared/format.ts", "");
    write("apps/cli/src/commands/readme.md", "");
    expect(listCommandFolders(root)).toEqual(["schema", "validate"]);
  });

  it("does nothing without the CLI app", () => {
    addCommand("schema");
    expect(writeCommandsFile(root)).toBe(false);
    expect(existsSync(join(root, generatedCommandsFile))).toBe(false);
  });

  it("writes an empty list when the app has no commands yet", () => {
    write("apps/cli/package.json", "{}");
    expect(listCommandFolders(root)).toEqual([]);
    expect(writeCommandsFile(root)).toBe(true);
    expect(readFileSync(join(root, generatedCommandsFile), "utf8")).toBe(renderCommandsFile([]));
  });

  it("writes the list once and again only when the commands change", () => {
    write("apps/cli/package.json", "{}");
    addCommand("schema");
    expect(writeCommandsFile(root)).toBe(true);
    const path = join(root, generatedCommandsFile);
    expect(readFileSync(path, "utf8")).toBe(renderCommandsFile(["schema"]));
    expect(writeCommandsFile(root)).toBe(false);

    addCommand("init");
    expect(writeCommandsFile(root)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("= [initCommand, schemaCommand];");
  });
});
