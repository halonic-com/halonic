import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  diskSettingsFolder,
  resetSettingsFolder,
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
    ...diskSettingsFolder,
    written,
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

verifies("harness-kit.settings-folder-reset", () => {
  describe("resetSettingsFolder", () => {
    const signInText = '{ "account": "acme" }\n';

    it("keeps only the settings files and the sign-in, and leaves a link's target alone", async () => {
      const settings = join(folder, "settings");
      const elsewhere = join(folder, "elsewhere");
      await mkdir(join(settings, "skills", "notes"), { recursive: true });
      await mkdir(elsewhere);
      await writeFile(join(elsewhere, "keep.md"), "kept\n");
      await writeFile(join(settings, "skills", "notes", "SKILL.md"), "notes\n");
      await writeFile(join(settings, "CLAUDE.md"), "notes\n");
      await writeFile(join(settings, ".credentials.json"), signInText);
      await symlink(elsewhere, join(settings, "agents"), "junction");

      await resetSettingsFolder(
        settings,
        { files, signIn: [".credentials.json"] },
        diskSettingsFolder,
      );

      expect((await readdir(settings)).sort()).toEqual([
        ".credentials.json",
        "mcp.json",
        "settings.json",
      ]);
      expect(await readFile(join(settings, ".credentials.json"), "utf8")).toBe(signInText);
      expect(await readdir(elsewhere)).toEqual(["keep.md"]);
    });

    it("makes a settings folder that doesn't exist yet", async () => {
      const settings = join(folder, "agents", "writer");
      await resetSettingsFolder(settings, { files, signIn: ["auth.json"] }, diskSettingsFolder);

      expect((await readdir(settings)).sort()).toEqual(["mcp.json", "settings.json"]);
    });

    it("writes no file whose text is already the same", async () => {
      await writeSettingsFiles(folder, files, diskSettingsFolder);
      const writer = countingWriter();

      await resetSettingsFolder(folder, { files, signIn: [] }, writer);
      expect(writer.written).toEqual([]);
    });

    it("stops when an entry can't be removed", async () => {
      await writeFile(join(folder, "AGENTS.md"), "notes\n");
      const writer: SettingsFolderWriter = {
        ...diskSettingsFolder,
        remove: async () => {
          throw new Error("The file is in use.");
        },
      };

      await expect(resetSettingsFolder(folder, { files, signIn: [] }, writer)).rejects.toThrow(
        "The file is in use.",
      );
    });
  });

  describe("diskSettingsFolder", () => {
    it("lists hidden entries, and none for a folder that doesn't exist", async () => {
      await writeFile(join(folder, ".hidden"), "");

      expect(await diskSettingsFolder.list(folder)).toEqual([".hidden"]);
      expect(await diskSettingsFolder.list(join(folder, "missing"))).toEqual([]);
    });

    it("says whether anything is at a path, a link that points nowhere too", async () => {
      await symlink(join(folder, "nowhere"), join(folder, "dangling"), "junction");
      await writeFile(join(folder, "file"), "");

      expect(await diskSettingsFolder.exists(join(folder, "dangling"))).toBe(true);
      expect(await diskSettingsFolder.exists(join(folder, "missing"))).toBe(false);
      expect(await diskSettingsFolder.exists(join(folder, "file", "inside"))).toBe(false);
    });
  });
});
