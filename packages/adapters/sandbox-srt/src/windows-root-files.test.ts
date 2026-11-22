import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RootFilePlaceholders, rootDenyFiles } from "./windows-root-files.ts";
import { toolFoldersToCreate } from "./windows-tool-folders.ts";

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

verifies("sandbox-srt.windows-tool-folders", () => {
  describe("rootDenyFiles", () => {
    it("holds the root tool settings and none of the tool folders", () => {
      expect(rootDenyFiles).toEqual(
        expect.arrayContaining([".npmrc", ".mcp.json", ".pre-commit-config.yaml"]),
      );
      expect(rootDenyFiles.filter((name) => toolFoldersToCreate.includes(name))).toEqual([]);
      expect(rootDenyFiles.filter((name) => /[\\/]/.test(name))).toEqual([]);
    });
  });

  describe("RootFilePlaceholders", () => {
    let work: string;
    let rootFiles: RootFilePlaceholders;

    beforeEach(async () => {
      work = await mkdtemp(join(tmpdir(), "root-files-"));
      rootFiles = new RootFilePlaceholders();
    });

    afterEach(async () => {
      await rm(work, { recursive: true, force: true });
    });

    /** What `srt-win acl stamp` does for a deny on a missing file: makes it empty. */
    async function stampPlaceholders(): Promise<void> {
      for (const name of [".npmrc", ".mcp.json", ".pre-commit-config.yaml"]) {
        if (!(await exists(join(work, name)))) await writeFile(join(work, name), "");
      }
    }

    it("removes the empty files that were missing when the session opened", async () => {
      await rootFiles.hold(work);
      await stampPlaceholders();
      expect(await rootFiles.release(work)).toEqual([]);
      for (const name of [".npmrc", ".mcp.json", ".pre-commit-config.yaml"]) {
        expect(await exists(join(work, name))).toBe(false);
      }
    });

    it("keeps an empty file that was there before the session opened", async () => {
      await writeFile(join(work, ".npmrc"), "");
      await rootFiles.hold(work);
      await stampPlaceholders();
      await rootFiles.release(work);
      expect(await exists(join(work, ".npmrc"))).toBe(true);
      expect(await exists(join(work, ".mcp.json"))).toBe(false);
    });

    it("keeps a file that has content at the close", async () => {
      await rootFiles.hold(work);
      await stampPlaceholders();
      await writeFile(join(work, ".mcp.json"), "{}");
      await rootFiles.release(work);
      expect(await readFile(join(work, ".mcp.json"), "utf8")).toBe("{}");
    });

    it("keeps a folder or a link put at the path, and what the link points to", async () => {
      await rootFiles.hold(work);
      await mkdir(join(work, ".npmrc"));
      const target = join(work, "target");
      await writeFile(target, "");
      await symlink(target, join(work, ".mcp.json"));
      await rootFiles.release(work);
      expect((await lstat(join(work, ".npmrc"))).isDirectory()).toBe(true);
      expect((await lstat(join(work, ".mcp.json"))).isSymbolicLink()).toBe(true);
      expect(await exists(target)).toBe(true);
    });

    it("keeps the files until the last of two overlapping sessions closes", async () => {
      await rootFiles.hold(work);
      await stampPlaceholders();
      // The second session finds the files srt made for the first one already there.
      await rootFiles.hold(work);
      await rootFiles.release(work);
      expect(await exists(join(work, ".npmrc"))).toBe(true);
      await rootFiles.release(work);
      expect(await exists(join(work, ".npmrc"))).toBe(false);
    });

    it("counts the working folder as Windows names it, whatever the letter case", async () => {
      await rootFiles.hold(work);
      await stampPlaceholders();
      await rootFiles.hold(work.toUpperCase());
      await rootFiles.release(work);
      expect(await exists(join(work, ".npmrc"))).toBe(true);
    });

    it("removes nothing on a release with no hold, and doesn't count below zero", async () => {
      await stampPlaceholders();
      expect(await rootFiles.release(work)).toEqual([]);
      expect(await exists(join(work, ".npmrc"))).toBe(true);
      await rm(join(work, ".npmrc"));
      await rootFiles.hold(work);
      await stampPlaceholders();
      await rootFiles.release(work);
      expect(await exists(join(work, ".npmrc"))).toBe(false);
    });

    it("notes the files of a session that opens while another one's are being removed", async () => {
      await rootFiles.hold(work);
      await stampPlaceholders();
      const released = rootFiles.release(work);
      const held = rootFiles.hold(work);
      await Promise.all([released, held]);
      // The removal ran first, so the new session saw the files missing and srt makes them again.
      await stampPlaceholders();
      await rootFiles.release(work);
      expect(await exists(join(work, ".npmrc"))).toBe(false);
    });

    it("reports a file it can't remove instead of failing", async () => {
      const locked = new RootFilePlaceholders(() =>
        Promise.reject(new Error("the file is in use")),
      );
      await locked.hold(work);
      await stampPlaceholders();
      const failed = await locked.release(work);
      expect(failed).toHaveLength(3);
      expect(failed.join("\n")).toContain(`${join(work, ".npmrc")}: the file is in use`);
    });
  });
});
