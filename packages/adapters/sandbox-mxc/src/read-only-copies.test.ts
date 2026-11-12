import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { MemoryDisk } from "./memory-disk.test-helper.ts";
import { copyReadOnlyFiles, readOnlyCopiesFolder } from "./read-only-copies.ts";

// Made-up Windows paths, each marked for the leak guard on its own line.
const box = "C:\\acme\\data\\mxc-boxes\\box-1-a"; // leak-guard: allow absolute-path made-up Windows path for a test
const config = "C:\\acme\\tools\\config.json"; // leak-guard: allow absolute-path made-up Windows path for a test
const other = "C:\\acme\\docs\\config.json"; // leak-guard: allow absolute-path made-up Windows path for a test

verifies("sandbox-mxc.read-only-files", () => {
  describe("copyReadOnlyFiles", () => {
    it("copies each file into its own folder, so files of the same name never meet", async () => {
      const disk = new MemoryDisk().folder(box).file(config, "one").file(other, "two");
      const copies = await copyReadOnlyFiles(disk, box, [config, other], []);
      expect(copies).toEqual([
        { original: config, copy: `${readOnlyCopiesFolder(box)}\\1\\config.json` },
        { original: other, copy: `${readOnlyCopiesFolder(box)}\\2\\config.json` },
      ]);
      expect(await disk.readText(copies[0]?.copy ?? "")).toBe("one");
      expect(await disk.readText(copies[1]?.copy ?? "")).toBe("two");
    });

    it("makes nothing when there are no files", async () => {
      const disk = new MemoryDisk().folder(box);
      expect(await copyReadOnlyFiles(disk, box, [], [])).toEqual([]);
      expect(await disk.kind(readOnlyCopiesFolder(box))).toBe("missing");
    });

    it("refuses a file inside a denied path", async () => {
      const disk = new MemoryDisk().folder(box).file(config);
      await expect(
        copyReadOnlyFiles(disk, box, [config], ["C:\\acme\\tools"]), // leak-guard: allow absolute-path made-up Windows path for a test
      ).rejects.toThrow("inside a denied path");
      expect(disk.fileNames().filter((name) => name.includes("mxc-boxes"))).toEqual([]);
    });

    it("refuses when the box folder is inside a denied path, since the copies couldn't be read", async () => {
      const disk = new MemoryDisk().folder(box).file(config);
      await expect(
        copyReadOnlyFiles(disk, box, [config], ["C:\\acme\\data"]), // leak-guard: allow absolute-path made-up Windows path for a test
      ).rejects.toThrow("box folder is inside a denied path");
    });
  });
});
