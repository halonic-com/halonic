import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareToolFolders, toolFoldersToCreate } from "./windows-tool-folders.ts";

verifies("sandbox-srt.windows-tool-folders", () => {
  describe("prepareToolFolders", () => {
    let work: string;

    beforeEach(async () => {
      work = await mkdtemp(join(tmpdir(), "tool-folders-"));
    });

    afterEach(async () => {
      await rm(work, { recursive: true, force: true });
    });

    it("makes each missing tool folder empty and returns it", async () => {
      const folders = await prepareToolFolders(work);
      expect(folders).toEqual([...toolFoldersToCreate]);
      for (const folder of toolFoldersToCreate) {
        expect(await readdir(join(work, folder))).toEqual([]);
      }
    });

    it("never makes .git, .idea or a file in the root", async () => {
      await prepareToolFolders(work);
      const names = await readdir(work);
      expect(names).not.toContain(".git");
      expect(names).not.toContain(".idea");
      expect(names.filter((name) => !toolFoldersToCreate.includes(name))).toEqual([]);
    });

    it("keeps what an existing tool folder holds", async () => {
      await mkdir(join(work, ".vscode"));
      await writeFile(join(work, ".vscode", "settings.json"), "{}");
      await prepareToolFolders(work);
      expect(await readdir(join(work, ".vscode"))).toEqual(["settings.json"]);
    });

    it("denies .idea only when it exists", async () => {
      await mkdir(join(work, ".idea"));
      expect(await prepareToolFolders(work)).toEqual([...toolFoldersToCreate, ".idea"]);
    });

    it("leaves a .git alone", async () => {
      await mkdir(join(work, ".git"));
      expect(await prepareToolFolders(work)).toEqual([...toolFoldersToCreate]);
      expect(await readdir(join(work, ".git"))).toEqual([]);
    });

    it("denies a file that has the name of a tool folder as it is, and still opens", async () => {
      await writeFile(join(work, ".config"), "kept");
      expect(await prepareToolFolders(work)).toEqual([...toolFoldersToCreate]);
      expect(await readFile(join(work, ".config"), "utf8")).toBe("kept");
    });
  });
});
