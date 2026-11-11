import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { folderLinkProblems } from "./integration-folder.ts";

const folders: string[] = [];
afterAll(() => Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true }))));

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
  });
});
