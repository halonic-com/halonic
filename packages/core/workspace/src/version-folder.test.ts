import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { VersionFolder } from "./index.ts";
import { MemoryVersions } from "./test/memory-versions.ts";

const decoder = new TextDecoder();

/** A commit with two local integrations, one holding a private file. */
function committed() {
  const versions = new MemoryVersions();
  const commit = versions.commit({
    "workspace.yaml": "id: acme\n",
    "integrations/notes/integration.yaml": "id: notes\n",
    "integrations/notes/backend/index.js": "export default 1;\n",
    "integrations/notes/.env": "NOTES_MODE=demo\n",
    "integrations/mail/backend/index.js": "export default 'ü';\n",
  });
  return { versions, commit, folder: new VersionFolder(versions, commit, "memory:acme") };
}

verifies("workspace.version-folder", () => {
  describe("VersionFolder", () => {
    it("reads a file's committed text as UTF-8 bytes", async () => {
      const { folder } = committed();
      const bytes = await folder.read("integrations/mail/backend/index.js");
      expect(bytes).not.toBeNull();
      expect(decoder.decode(bytes ?? new Uint8Array())).toBe("export default 'ü';\n");
      expect(await folder.read("integrations/mail/missing.js")).toBeNull();
    });

    it("lists a folder recursively, with the folders above each file and each file's size", async () => {
      const { folder } = committed();
      expect(await folder.entries("integrations/notes")).toEqual([
        { path: "integrations/notes/backend", kind: "folder" },
        { path: "integrations/notes/backend/index.js", kind: "file", size: 18 },
        { path: "integrations/notes/integration.yaml", kind: "file", size: 10 },
      ]);
    });

    it("leaves out a private entry as the run's copy does, and reads it as missing", async () => {
      const { folder, versions } = committed();
      const listed = (await folder.entries()).map((entry) => entry.path);
      expect(listed).not.toContain("integrations/notes/.env");
      versions.calls.length = 0;
      expect(await folder.read("integrations/notes/.env")).toBeNull();
      expect(versions.calls).toEqual([]);
    });

    it("lists only what is directly in a folder when asked not to go into folders", async () => {
      const { folder } = committed();
      expect(await folder.entries("integrations", { recursive: false })).toEqual([
        { path: "integrations/mail", kind: "folder" },
        { path: "integrations/notes", kind: "folder" },
      ]);
    });

    it("stops one entry past a limit, so the caller sees the folder went past it", async () => {
      const { folder } = committed();
      expect(await folder.entries("integrations", { limit: 2 })).toHaveLength(3);
    });

    it("gives nothing for a folder the version doesn't have", async () => {
      const { folder } = committed();
      expect(await folder.entries("integrations/calendar")).toEqual([]);
      expect(await folder.locationOf("integrations/calendar")).toBeNull();
      expect(await folder.locationOf("integrations/notes")).toBe("memory:acme/integrations/notes");
    });

    it("refuses an unsafe path and a version that isn't a full commit id", async () => {
      const { folder, versions } = committed();
      await expect(folder.read("../secrets.txt")).rejects.toThrow(RangeError);
      await expect(folder.entries("integrations\\notes")).rejects.toThrow(RangeError);
      expect(() => new VersionFolder(versions, "HEAD", "memory:acme")).toThrow(RangeError);
    });
  });
});
