import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FolderDefinitionStore } from "./definition-store.ts";
import { removeTempFolders, tempFolder, writeFiles } from "./temp-folder.test-helper.ts";

/**
 * Plays Windows with a program that holds the target open: the next
 * `busyRenames` renames fail with `EBUSY` as Windows gives it. Waits between
 * tries are counted, never really waited.
 */
const hooks = vi.hoisted(() => ({ busyRenames: 0, waits: 0 }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    rename: async (from: string, to: string) => {
      if (hooks.busyRenames > 0) {
        hooks.busyRenames -= 1;
        throw Object.assign(new Error("EBUSY: resource busy or locked, rename"), {
          code: "EBUSY",
        });
      }
      return await fs.rename(from, to);
    },
  };
});

vi.mock("node:timers/promises", () => ({
  setTimeout: async () => {
    hooks.waits += 1;
  },
}));

const realPlatform = Object.getOwnPropertyDescriptor(process, "platform");

beforeAll(() => {
  Object.defineProperty(process, "platform", { value: "win32" });
});
afterAll(async () => {
  if (realPlatform !== undefined) {
    Object.defineProperty(process, "platform", realPlatform);
  }
  await removeTempFolders();
});
afterEach(() => {
  hooks.busyRenames = 0;
  hooks.waits = 0;
});

async function folderWith(
  files: Record<string, string>,
): Promise<{ root: string; store: FolderDefinitionStore }> {
  const root = await tempFolder();
  await writeFiles(root, files);
  return { root, store: new FolderDefinitionStore(root) };
}

verifies("fs-node.rename-retry-on-windows", () => {
  describe("folder: a file another program holds on Windows", () => {
    it("writes once the other program lets go of the file", async () => {
      const { root, store } = await folderWith({ "a.yaml": "1" });
      hooks.busyRenames = 2;
      expect(await store.write("a.yaml", "2")).toEqual({ status: "written" });
      expect(hooks.waits).toBe(2);
      expect(await readFile(join(root, "a.yaml"), "utf8")).toBe("2");
      expect(await readdir(root)).toEqual(["a.yaml"]);
    });

    it("fails, keeps the old text and removes its temporary file when the file stays held", async () => {
      const { root, store } = await folderWith({ "a.yaml": "1" });
      hooks.busyRenames = 100;
      await expect(store.write("a.yaml", "2")).rejects.toMatchObject({ code: "EBUSY" });
      expect(hooks.waits).toBe(5);
      expect(await readFile(join(root, "a.yaml"), "utf8")).toBe("1");
      expect(await readdir(root)).toEqual(["a.yaml"]);
    });
  });
});
