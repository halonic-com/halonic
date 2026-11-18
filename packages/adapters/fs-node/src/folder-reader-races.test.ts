import type { BigIntStats, StatOptions, Stats } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { FileSystemFolderReader } from "./folder-reader.ts";
import { removeTempFolders, tempFolder, writeFiles } from "./temp-folder.test-helper.ts";

/**
 * Plays another program that changes the folder at the moment that matters.
 * `beforeReaddir`: runs once before the next `readdir` of that folder.
 * `beforeOpen`: runs once before the next `open`.
 * `wideFileIds`: every file id is as large as an NTFS one with a high
 * sequence number, past 2^53, so a plain number keeps none of the bits that
 * tell two files apart; only a `bigint` keeps them.
 */
const hooks = vi.hoisted(() => ({
  beforeReaddir: undefined as { folder: string; run: () => Promise<void> } | undefined,
  beforeOpen: undefined as (() => Promise<void>) | undefined,
  wideFileIds: false,
}));

/** What `stat` reports when `hooks.wideFileIds` is on: see there. */
const widen = vi.hoisted(() => <T extends Stats | BigIntStats>(stats: T): T => {
  if (!hooks.wideFileIds) return stats;
  const ino = typeof stats.ino === "bigint" ? 2n ** 60n + stats.ino : 2 ** 60;
  return Object.defineProperty(stats, "ino", { value: ino });
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    readdir: (async (...args: Parameters<typeof fs.readdir>) => {
      const before = hooks.beforeReaddir;
      if (before !== undefined && args[0] === before.folder) {
        hooks.beforeReaddir = undefined;
        await before.run();
      }
      return await fs.readdir(...args);
    }) as typeof fs.readdir,
    open: (async (...args: Parameters<typeof fs.open>) => {
      const before = hooks.beforeOpen;
      hooks.beforeOpen = undefined;
      await before?.();
      const handle = await fs.open(...args);
      const stat = handle.stat.bind(handle);
      handle.stat = (async (options?: StatOptions) =>
        widen(await stat(options))) as typeof handle.stat;
      return handle;
    }) as typeof fs.open,
    lstat: (async (...args: Parameters<typeof fs.lstat>) =>
      widen(await fs.lstat(...args))) as typeof fs.lstat,
  };
});

afterEach(() => {
  hooks.beforeReaddir = undefined;
  hooks.beforeOpen = undefined;
  hooks.wideFileIds = false;
});

afterAll(removeTempFolders);

verifies("fs-node.folder-reader", () => {
  it("leaves out a folder removed between seeing it and listing it", async () => {
    const root = await tempFolder();
    await writeFiles(root, { "acme/plugin.yaml": "id: acme\n", "beta/plugin.yaml": "id: beta\n" });
    const acme = join(root, "acme");
    hooks.beforeReaddir = { folder: acme, run: () => rm(acme, { recursive: true }) };

    const entries = await new FileSystemFolderReader(root).entries();

    expect(hooks.beforeReaddir).toBeUndefined();
    expect(entries).toEqual([
      { path: "acme", kind: "folder" },
      { path: "beta", kind: "folder" },
      { path: "beta/plugin.yaml", kind: "file", size: 9 },
    ]);
  });

  it("refuses a file swapped for another between the check and the open", async () => {
    const root = await tempFolder();
    // Both files exist at once, so the swapped-in one is surely another file.
    await writeFiles(root, { "acme/plugin.yaml": "id: acme\n", "acme/swap.yaml": "id: evil\n" });
    hooks.beforeOpen = () => rename(join(root, "acme/swap.yaml"), join(root, "acme/plugin.yaml"));

    await expect(new FileSystemFolderReader(root).read("acme/plugin.yaml")).rejects.toThrow(
      /changed while it was opened/,
    );
  });

  it("tells a swapped-in file apart by every bit of its file id, as on Windows", async () => {
    const root = await tempFolder();
    await writeFiles(root, { "acme/plugin.yaml": "id: acme\n", "acme/swap.yaml": "id: evil\n" });
    hooks.wideFileIds = true;
    hooks.beforeOpen = () => rename(join(root, "acme/swap.yaml"), join(root, "acme/plugin.yaml"));

    await expect(new FileSystemFolderReader(root).read("acme/plugin.yaml")).rejects.toThrow(
      /changed while it was opened/,
    );
  });

  it("still reads a file that wasn't swapped when its file id is that large", async () => {
    const root = await tempFolder();
    await writeFiles(root, { "acme/plugin.yaml": "id: acme\n" });
    hooks.wideFileIds = true;

    const bytes = await new FileSystemFolderReader(root).read("acme/plugin.yaml");

    expect(new TextDecoder().decode(bytes ?? undefined)).toBe("id: acme\n");
  });
});
