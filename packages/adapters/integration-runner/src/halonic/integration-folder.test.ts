import { link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import {
  type FolderEntry,
  folderLinkProblems,
  type IntegrationFolderDisk,
  maxFolderEntries,
} from "./integration-folder.ts";

const folders: string[] = [];
afterAll(() => Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true }))));

async function emptyFolder(): Promise<{ root: string; folder: string }> {
  const root = await mkdtemp(join(tmpdir(), "runner-links-"));
  folders.push(root);
  const folder = join(root, "weather");
  await mkdir(folder);
  return { root, folder };
}

/** A folder `levels` deep with `perLevel` entries on each level: files and, but at the bottom, one folder. */
function nestedDisk(perLevel: number, levels: number): IntegrationFolderDisk {
  const file = (n: number): FolderEntry => ({ name: `file-${n}.js`, kind: "file" });
  return {
    entries: (folder) => {
      // Count the `more` folders on the way down; Windows joins with `\`, other systems with `/`.
      const level = folder.split(/[\\/]/).filter((part) => part === "more").length;
      if (level === levels - 1) return Array.from({ length: perLevel }, (_, n) => file(n));
      const files = Array.from({ length: perLevel - 1 }, (_, n) => file(n));
      return [...files, { name: "more", kind: "folder" }];
    },
    realPath: (path) => path,
    identity: (path) => ({ id: path, names: 1 }),
  };
}

verifies("integration-runner.local-integration", () => {
  describe("the link check on this machine's disk", () => {
    // Junctions, so Windows makes them without extra rights; other systems make plain links.
    it("allows a link that stays inside, and refuses one out of the folder at any depth", async () => {
      const root = await mkdtemp(join(tmpdir(), "runner-links-"));
      folders.push(root);
      const folder = join(root, "weather");
      const store = join(folder, "node_modules", ".pnpm", "zod");
      await mkdir(store, { recursive: true });
      await writeFile(join(folder, "index.js"), "export const weather = {};\n");
      await symlink(store, join(folder, "node_modules", "zod"), "junction");
      expect(folderLinkProblems("weather", folder)).toEqual([]);

      await mkdir(join(root, "secret"));
      await symlink(
        join(root, "secret"),
        join(folder, "node_modules", ".pnpm", "keys"),
        "junction",
      );
      expect(folderLinkProblems("weather", folder)).toEqual([
        {
          code: "link-out-of-folder",
          path: [],
          message: `weather: its folder holds a link out of it, ${join("node_modules", ".pnpm", "keys")}`,
        },
      ]);
    });

    it("allows a file hard-linked inside the folder, and refuses one with a name outside it", async () => {
      const { root, folder } = await emptyFolder();
      await writeFile(join(folder, "index.js"), "export const weather = {};\n");
      await link(join(folder, "index.js"), join(folder, "copy.js"));
      expect(folderLinkProblems("weather", folder)).toEqual([]);

      await writeFile(join(root, "id_example"), "not a real key\n");
      await link(join(root, "id_example"), join(folder, "key.txt"));
      expect(folderLinkProblems("weather", folder)).toEqual([
        {
          code: "hard-link-out-of-folder",
          path: [],
          message: "weather: its folder holds a hard link to a file outside it, key.txt",
          fix: "Copy the file into the folder instead of linking it; for packages, install with npm or with pnpm's `package-import-method=copy`.",
        },
      ]);
    });
  });

  describe("the size of the folder", () => {
    it(`reads up to ${maxFolderEntries} entries at any depth`, () => {
      expect(folderLinkProblems("weather", "/work/weather", nestedDisk(1000, 10))).toEqual([]);
    });

    it("refuses a folder with more, without reading the rest", () => {
      const disk = nestedDisk(1000, 11);
      let reads = 0;
      const counted: IntegrationFolderDisk = {
        ...disk,
        entries: (folder) => {
          reads += 1;
          return disk.entries(folder);
        },
      };
      expect(folderLinkProblems("weather", "/work/weather", counted)).toEqual([
        {
          code: "folder-too-large",
          path: [],
          message: `weather: its folder holds more than ${maxFolderEntries} entries`,
          fix: "Keep only the integration's code and Zod in its folder.",
        },
      ]);
      expect(reads).toBe(11);
    });
  });
});
