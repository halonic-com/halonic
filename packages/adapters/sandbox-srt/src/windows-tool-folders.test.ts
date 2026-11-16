import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
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

    it("denies .idea, .git/hooks and .git/config only when they exist", async () => {
      await mkdir(join(work, ".idea"));
      await mkdir(join(work, ".git", "hooks"), { recursive: true });
      await writeFile(join(work, ".git", "config"), "");
      const folders = await prepareToolFolders(work);
      expect(folders).toEqual([
        ...toolFoldersToCreate,
        ".idea",
        join(".git", "hooks"),
        join(".git", "config"),
      ]);
    });

    it("leaves a .git without hooks alone", async () => {
      await mkdir(join(work, ".git"));
      const folders = await prepareToolFolders(work);
      expect(folders).toEqual([...toolFoldersToCreate]);
      expect(await readdir(join(work, ".git"))).toEqual([]);
    });
  });
});
