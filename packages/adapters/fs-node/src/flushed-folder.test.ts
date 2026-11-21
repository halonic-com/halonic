import { type FileHandle, open, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { flushFolder } from "./flushed-folder.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);
afterEach(() => {
  vi.restoreAllMocks();
});

/** The prototype every open file's handle shares, so a spy on it sees every flush. */
let handles: FileHandle;

beforeAll(async () => {
  const handle = await open(join(await tempFolder(), "probe"), "w");
  await handle.close();
  handles = Object.getPrototypeOf(handle) as FileHandle;
});

function systemError(code: string): Error {
  return Object.assign(new Error(`${code}: flush failed`), { code });
}

verifies("fs-node.flush-folder", () => {
  it("flushes the folder once on Linux and macOS, and nothing on Windows", async () => {
    const sync = vi.spyOn(handles, "sync");

    await flushFolder(await tempFolder());

    expect(sync).toHaveBeenCalledTimes(process.platform === "win32" ? 0 : 1);
  });

  it("opens nothing on Windows", async () => {
    const missing = join(await tempFolder(), "not-there");

    await expect(flushFolder(missing, "win32")).resolves.toBeUndefined();
    await expect(flushFolder(missing, "linux")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("accepts a file system that can't flush a folder, and throws any other error", async () => {
    // Windows can't open a folder for reading, so a file stands in for it and
    // the test plays Linux: the error handling is the same, and it runs everywhere.
    const standIn = join(await tempFolder(), "stand-in");
    await writeFile(standIn, "");

    vi.spyOn(handles, "sync").mockRejectedValueOnce(systemError("EINVAL"));
    await expect(flushFolder(standIn, "linux")).resolves.toBeUndefined();

    vi.spyOn(handles, "sync").mockRejectedValueOnce(systemError("EIO"));
    await expect(flushFolder(standIn, "linux")).rejects.toMatchObject({ code: "EIO" });
  });
});
