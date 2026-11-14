import { chmod, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { FolderDefinitionStore } from "./definition-store.ts";
import { removeTempFolders, tempFolder, writeFiles } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const digest = {
  async sha256(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

async function folderWith(
  files: Record<string, string>,
): Promise<{ root: string; store: FolderDefinitionStore }> {
  const root = await tempFolder();
  await writeFiles(root, files);
  return { root, store: new FolderDefinitionStore(root) };
}

verifies("ports.definition-store-write-if-unchanged", () => {
  describe("folder: write if unchanged", () => {
    it("doesn't write over a file another program changed since it was read", async () => {
      const { root, store } = await folderWith({ "a.yaml": "1" });
      const read = await store.read("a.yaml");
      await writeFile(join(root, "a.yaml"), "3", "utf8");
      const result = await store.write("a.yaml", "2", {
        expected: await contentDigest(read ?? "", digest),
      });
      expect(result).toEqual({ status: "changed-on-disk", current: "3" });
      expect(await readFile(join(root, "a.yaml"), "utf8")).toBe("3");
    });

    it("writes when the file is unchanged, and creates one expected to be absent", async () => {
      const { root, store } = await folderWith({ "a.yaml": "1" });
      expect(
        await store.write("a.yaml", "2", { expected: await contentDigest("1", digest) }),
      ).toEqual({ status: "written" });
      expect(await store.write("hubs/b/hub.yaml", "id: b\n", { expected: "absent" })).toEqual({
        status: "written",
      });
      expect(await readFile(join(root, "a.yaml"), "utf8")).toBe("2");
      expect(await readFile(join(root, "hubs/b/hub.yaml"), "utf8")).toBe("id: b\n");
    });

    it("lets only one of two writes expecting the same text through", async () => {
      const { root, store } = await folderWith({ "a.yaml": "1" });
      const expected = await contentDigest("1", digest);
      const results = await Promise.all([
        store.write("a.yaml", "from the editor", { expected }),
        store.write("a.yaml", "from a proposal", { expected }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual(["changed-on-disk", "written"]);
      expect(await readFile(join(root, "a.yaml"), "utf8")).toBe("from the editor");
    });
  });
});

verifies("fs-node.write-is-whole-or-nothing", () => {
  describe("folder: whole writes", () => {
    it("leaves no temporary file behind and lists none", async () => {
      const { root, store } = await folderWith({ "a.yaml": "1" });
      await store.write("a.yaml", "2");
      expect(await readdir(root)).toEqual(["a.yaml"]);
      await writeFile(join(root, ".halonic-write-0b5e.tmp"), "half", "utf8");
      expect(await store.list()).toEqual(["a.yaml"]);
    });

    it("changes nothing and cleans up when the write fails", async () => {
      // A folder where the file should go makes the rename fail on every system.
      const { root, store } = await folderWith({ "hubs/a.yaml/x.yaml": "1" });
      await expect(store.write("hubs/a.yaml", "2")).rejects.toThrow();
      expect(await readdir(join(root, "hubs"))).toEqual(["a.yaml"]);
      expect(await readFile(join(root, "hubs/a.yaml/x.yaml"), "utf8")).toBe("1");
    });

    it("keeps the permissions of the file it replaces", async () => {
      const { root, store } = await folderWith({ "run.sh": "echo 1\n" });
      const file = join(root, "run.sh");
      await chmod(file, 0o755);
      // Windows has no execute bit: its modes only say read-only or not, so the script reads 0o666.
      const before = (await stat(file)).mode & 0o777;
      expect(before).toBe(process.platform === "win32" ? 0o666 : 0o755);
      await store.write("run.sh", "echo 2\n");
      expect((await stat(file)).mode & 0o777).toBe(before);
    });

    it("never lets a reader see half a file while it is rewritten", async () => {
      // Large texts, so a write that isn't whole would be caught in the middle.
      const before = "a: 1\n".repeat(50_000);
      const after = "b: 2\n".repeat(50_000);
      const { root, store } = await folderWith({ "review.yaml": before });
      let writing = true;
      const writer = (async () => {
        try {
          for (let round = 0; round < 40; round += 1) {
            await store.write("review.yaml", round % 2 === 0 ? after : before);
          }
        } finally {
          // A failed write ends the reads too, so its error shows at once
          // instead of the test hanging until it times out.
          writing = false;
        }
      })();
      let partialReads = 0;
      while (writing) {
        const text = await readFile(join(root, "review.yaml"), "utf8");
        if (text !== before && text !== after) {
          partialReads += 1;
        }
      }
      await writer;
      expect(partialReads).toBe(0);
    });
  });
});
