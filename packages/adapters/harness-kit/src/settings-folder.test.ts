import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  diskSettingsFolder,
  type SettingsFolderWriter,
  writeSettingsFiles,
} from "./settings-folder.ts";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "harness-settings-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const files = { "settings.json": '{ "sandbox": false }\n', "mcp.json": "{}\n" };

/** The disk writer, counting what it writes. */
function countingWriter(): SettingsFolderWriter & { written: string[] } {
  const written: string[] = [];
  return {
    written,
    read: (path) => diskSettingsFolder.read(path),
    write: async (path, text) => {
      written.push(path);
      await diskSettingsFolder.write(path, text);
    },
  };
}

verifies("harness-kit.settings-folder", () => {
  describe("writeSettingsFiles", () => {
    it("writes each file into the folder, creating the folder when it doesn't exist yet", async () => {
      const inside = join(folder, "agents", "writer");
      await writeSettingsFiles(inside, files, diskSettingsFolder);

      expect(await readFile(join(inside, "settings.json"), "utf8")).toBe(files["settings.json"]);
      expect(await readFile(join(inside, "mcp.json"), "utf8")).toBe(files["mcp.json"]);
    });

    it("leaves files that already hold the same text alone", async () => {
      await writeSettingsFiles(folder, files, diskSettingsFolder);
      const writer = countingWriter();

      await writeSettingsFiles(folder, files, writer);
      expect(writer.written).toEqual([]);
    });

    it("replaces a file that holds something else, and leaves nothing aside", async () => {
      await diskSettingsFolder.write(join(folder, "settings.json"), "{}\n");
      const writer = countingWriter();

      await writeSettingsFiles(folder, files, writer);
      expect(writer.written).toEqual([join(folder, "settings.json"), join(folder, "mcp.json")]);
      expect(await readFile(join(folder, "settings.json"), "utf8")).toBe(files["settings.json"]);
      expect((await readdir(folder)).sort()).toEqual(["mcp.json", "settings.json"]);
    });
  });

  describe("diskSettingsFolder", () => {
    it("reads a file that doesn't exist as null", async () => {
      expect(await diskSettingsFolder.read(join(folder, "missing.json"))).toBeNull();
    });

    it("passes on an error other than a missing file", async () => {
      await expect(diskSettingsFolder.read(folder)).rejects.toThrow();
    });

    it("leaves nothing aside when the file can't be written", async () => {
      // The target is a folder, so the rename into place fails.
      await diskSettingsFolder.write(join(folder, "taken", "inside.json"), "{}\n");

      await expect(diskSettingsFolder.write(join(folder, "taken"), "{}\n")).rejects.toThrow();
      expect(await readdir(folder)).toEqual(["taken"]);
    });
  });
});
