import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { deniedGrantPaths, type GrantDisk, grantPath, readOnlyGrants } from "./grant-path.ts";

/** A disk where `files` are files, `folders` are folders and nothing else is there. */
function disk(entries: { files?: string[]; folders?: string[] }): GrantDisk & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    kind: async (path) => {
      asked.push(path);
      if (entries.files?.includes(path)) return "file";
      if (entries.folders?.includes(path)) return "folder";
      return "missing";
    },
  };
}

verifies("sandbox-mxc.grant-paths", () => {
  describe("grantPath", () => {
    it.each([
      ["C:\\acme\\project", "C:\\acme\\project"], // leak-guard: allow absolute-path made-up Windows path for a test
      ["c:/acme/project/", "C:\\acme\\project"], // leak-guard: allow absolute-path made-up Windows path for a test
      ["C:\\acme\\project\\\\", "C:\\acme\\project"], // leak-guard: allow absolute-path made-up Windows path for a test
      ["C:\\acme\\.\\project\\tools\\..", "C:\\acme\\project"], // leak-guard: allow absolute-path made-up Windows path for a test
      ["D:/acme//tools", "D:\\acme\\tools"], // leak-guard: allow absolute-path made-up Windows path for a test
    ])("writes %s as %s", (path, plain) => {
      expect(grantPath(path)).toBe(plain);
    });

    const driveRoots = ["C:\\", "c:/", "C:\\acme\\.."]; // leak-guard: allow absolute-path made-up Windows path for a test
    it.each(driveRoots)("never grants the drive root %s", (path) => {
      expect(() => grantPath(path)).toThrow(/never grants a drive root/);
    });

    // Windows drops a part's trailing dots and spaces: the first two are the
    // drive root in disguise, the third is `C:\acme`. // leak-guard: allow absolute-path made-up Windows path for a test
    const endsInDotOrSpace = ["C:\\acme\\..\\...", "C:\\ ", "C:\\acme. ", "C:\\acme.\\tools"]; // leak-guard: allow absolute-path made-up Windows path for a test
    it.each(endsInDotOrSpace)("refuses %s, whose name Windows would change", (path) => {
      expect(() => grantPath(path)).toThrow(/ends in a dot or a space/);
    });

    const streams = ["C:\\acme\\notes.txt::$DATA", "C:\\acme:hidden"]; // leak-guard: allow absolute-path made-up Windows path for a test
    it.each(streams)("refuses %s, which names a stream inside a file", (path) => {
      expect(() => grantPath(path)).toThrow(/":" after the drive letter/);
    });

    // `C:` alone means the current folder on drive C, so it isn't absolute either.
    const notAbsolute = [
      "acme\\project",
      "\\acme\\project",
      "\\\\server\\share\\acme",
      "/home/acme", // leak-guard: allow absolute-path made-up Linux path for a test
      "C:",
    ]; // leak-guard: allow absolute-path made-up Windows path for a test
    it.each(notAbsolute)("refuses %s, which isn't absolute with a drive letter", (path) => {
      expect(() => grantPath(path)).toThrow(/absolute Windows path with a drive letter/);
    });
  });

  describe("readOnlyGrants", () => {
    it("grants folders in plain form, once each", async () => {
      const tools = "C:\\acme\\tools"; // leak-guard: allow absolute-path made-up Windows path for a test
      const grants = await readOnlyGrants(["c:/acme/tools/", tools], disk({ folders: [tools] }));
      expect(grants).toEqual({ folders: [tools], files: [] });
    });

    it("sorts a single file apart and never grants the folder around it", async () => {
      const file = "C:\\acme\\tools\\runner.mjs"; // leak-guard: allow absolute-path made-up Windows path for a test
      const docs = "C:\\acme\\docs"; // leak-guard: allow absolute-path made-up Windows path for a test
      const onDisk = disk({ files: [file], folders: [docs, "C:\\acme\\tools"] }); // leak-guard: allow absolute-path made-up Windows path for a test
      expect(await readOnlyGrants([docs, file, "c:/acme/tools/runner.mjs"], onDisk)).toEqual({
        folders: [docs],
        files: [file],
      });
      expect(onDisk.asked).not.toContain("C:\\acme\\tools"); // leak-guard: allow absolute-path made-up Windows path for a test
    });

    it("leaves out a path that isn't there, since there is nothing to read", async () => {
      const gone = "C:\\acme\\gone"; // leak-guard: allow absolute-path made-up Windows path for a test
      expect(await readOnlyGrants([gone], disk({}))).toEqual({ folders: [], files: [] });
    });

    it("refuses a drive root before asking the disk", async () => {
      const onDisk = disk({ folders: ["C:"] });
      await expect(readOnlyGrants(["C:\\"], onDisk)).rejects.toThrow(/drive root/);
      expect(onDisk.asked).toEqual([]);
    });
  });

  describe("deniedGrantPaths", () => {
    it("keeps single files, in plain form, once each", () => {
      const secrets = ["c:/acme/project/.env", "C:\\acme\\project\\.env"]; // leak-guard: allow absolute-path made-up Windows path for a test
      expect(deniedGrantPaths(secrets)).toEqual([
        "C:\\acme\\project\\.env", // leak-guard: allow absolute-path made-up Windows path for a test
      ]);
    });
  });
});
