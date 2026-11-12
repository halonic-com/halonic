import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type BoxDisk, BoxFolders, boxFoldersBase, diskOnThisMachine } from "./box-folders.ts";

/** The real disk, with a process table where only `running` ids run. */
function diskWith(running: number[]): BoxDisk {
  return { ...diskOnThisMachine, isRunning: (processId) => running.includes(processId) };
}

verifies("sandbox-mxc.box-folders", () => {
  describe("BoxFolders", () => {
    let dataFolder: string;
    let base: string;

    beforeEach(async () => {
      dataFolder = await mkdtemp(join(tmpdir(), "acme-halonic-data-"));
      base = join(dataFolder, boxFoldersBase);
    });

    afterEach(async () => {
      await rm(dataFolder, { recursive: true, force: true });
    });

    it("makes a new, empty folder for every box, under the one base folder", async () => {
      const boxes = new BoxFolders(dataFolder, 4242, diskWith([4242]));
      const first = await boxes.create();
      const second = await boxes.create();
      expect(first.path).not.toBe(second.path);
      for (const box of [first, second]) {
        expect(join(box.path, "..")).toBe(base);
        expect(box.path).toMatch(/[\\/]box-4242-[^\\/]+$/);
        expect(await readdir(box.path)).toEqual([]);
      }
    });

    it("removes a box folder with everything in it, and a second removal does nothing", async () => {
      const box = await new BoxFolders(dataFolder, 4242, diskWith([4242])).create();
      await mkdir(join(box.path, "work"));
      await writeFile(join(box.path, "work", "notes.txt"), "acme");
      await box.remove();
      await box.remove();
      expect(await readdir(base)).toEqual([]);
    });

    it("removes what a crashed Halonic left behind, and keeps a running one's folders", async () => {
      await mkdir(join(base, "box-111-crashed", "work"), { recursive: true });
      await mkdir(join(base, "box-222-running"), { recursive: true });
      await mkdir(join(base, "not-a-box"), { recursive: true });
      const box = await new BoxFolders(dataFolder, 4242, diskWith([222, 4242])).create();
      const left = await readdir(base);
      expect(left.sort()).toEqual(
        ["box-222-running", "not-a-box", join(box.path).slice(base.length + 1)].sort(),
      );
    });

    it("clears leftovers only once, so its own open boxes stay", async () => {
      const boxes = new BoxFolders(dataFolder, 4242, diskWith([]));
      const first = await boxes.create();
      await boxes.create();
      expect(await readdir(base)).toContain(first.path.slice(base.length + 1));
    });

    it("tries the clean-up again when it failed, instead of failing every box after it", async () => {
      let failures = 1;
      const flaky: BoxDisk = {
        ...diskWith([]),
        names: async (folder) => {
          if (failures-- > 0) throw new Error("acme disk is busy");
          return diskOnThisMachine.names(folder);
        },
      };
      const boxes = new BoxFolders(dataFolder, 4242, flaky);
      await expect(boxes.create()).rejects.toThrow("acme disk is busy");
      await expect(boxes.create()).resolves.toMatchObject({ path: expect.any(String) });
    });
  });
});
