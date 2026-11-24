import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { cliCodingToolsServer, codingToolsCodeRoot } from "./coding-tools-mode.ts";
import { removeTestFolder } from "./test/remove-folder.ts";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => removeTestFolder(folder)));
});

async function newFolder(): Promise<string> {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "cli-coding-tools-")));
  folders.push(folder);
  return folder;
}

verifies("cli.coding-tools-mode", () => {
  describe("cliCodingToolsServer", () => {
    it("starts the CLI's own Node with its entry in the coding-tools mode", async () => {
      const server = cliCodingToolsServer("linux");
      const node = await realpath(process.execPath);

      expect(server?.program).toBe(node);
      expect(server?.args.at(-1)).toBe("coding-tools");
      expect(server?.args[0]).toMatch(/[/\\]bin[/\\]halonic\.js$/);
      expect(server?.codePaths).toEqual([node, codingToolsCodeRoot()]);
    });

    it("names no server on Windows, where harnesses run only in the WSL distro", () => {
      expect(cliCodingToolsServer("win32")).toBeUndefined();
    });
  });

  describe("codingToolsCodeRoot", () => {
    it("is the repo's root for a CLI in a pnpm workspace", async () => {
      const repo = await newFolder();
      await mkdir(join(repo, "apps", "cli"), { recursive: true });
      await writeFile(join(repo, "pnpm-workspace.yaml"), "packages: []\n");

      expect(codingToolsCodeRoot(join(repo, "apps", "cli"))).toBe(repo);
    });

    it("is the CLI's own folder once installed", async () => {
      const installed = join(await newFolder(), "lib", "node_modules", "halonic");
      await mkdir(installed, { recursive: true });

      expect(codingToolsCodeRoot(installed)).toBe(installed);
    });
  });
});
