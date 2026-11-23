import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  rmdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DenyPlaceholders, denyPlaceholderPaths } from "./windows-deny-placeholders.ts";
import { toolFoldersToCreate } from "./windows-tool-folders.ts";

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

verifies("sandbox-srt.windows-tool-folders", () => {
  describe("denyPlaceholderPaths", () => {
    it("holds the root tool settings and the two-name entries, and none of the tool folders", () => {
      expect(denyPlaceholderPaths).toEqual(
        expect.arrayContaining([
          [".npmrc"],
          [".mcp.json"],
          [".pre-commit-config.yaml"],
          [".yarn", "releases"],
          [".yarn", "plugins"],
          [".claude", "settings.json"],
        ]),
      );
      const toolFolders = denyPlaceholderPaths.filter(
        (segments) => segments.length === 1 && toolFoldersToCreate.includes(segments[0] ?? ""),
      );
      expect(toolFolders).toEqual([]);
    });
  });

  describe("DenyPlaceholders", () => {
    let work: string;
    let placeholders: DenyPlaceholders;

    beforeEach(async () => {
      work = await mkdtemp(join(tmpdir(), "deny-placeholders-"));
      placeholders = new DenyPlaceholders();
    });

    afterEach(async () => {
      await rm(work, { recursive: true, force: true });
    });

    /** What `srt-win acl stamp` does for a deny on a missing file: makes each folder on the way, and the file empty. */
    async function stamp(...segments: string[]): Promise<void> {
      const path = join(work, ...segments);
      if (await exists(path)) return;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "");
    }

    async function stampPlaceholders(): Promise<void> {
      for (const name of [".npmrc", ".mcp.json", ".pre-commit-config.yaml"]) await stamp(name);
    }

    async function stampYarn(): Promise<void> {
      await stamp(".yarn", "releases");
      await stamp(".yarn", "plugins");
    }

    it("removes the empty files that were missing when the session opened", async () => {
      await placeholders.hold(work);
      await stampPlaceholders();
      expect(await placeholders.release(work)).toEqual([]);
      for (const name of [".npmrc", ".mcp.json", ".pre-commit-config.yaml"]) {
        expect(await exists(join(work, name))).toBe(false);
      }
    });

    it("keeps an empty file that was there before the session opened", async () => {
      await writeFile(join(work, ".npmrc"), "");
      await placeholders.hold(work);
      await stampPlaceholders();
      await placeholders.release(work);
      expect(await exists(join(work, ".npmrc"))).toBe(true);
      expect(await exists(join(work, ".mcp.json"))).toBe(false);
    });

    it("keeps a file that has content at the close", async () => {
      await placeholders.hold(work);
      await stampPlaceholders();
      await writeFile(join(work, ".mcp.json"), "{}");
      await placeholders.release(work);
      expect(await readFile(join(work, ".mcp.json"), "utf8")).toBe("{}");
    });

    it("keeps a folder or a link put at the path, and what the link points to", async () => {
      await placeholders.hold(work);
      await mkdir(join(work, ".npmrc"));
      const target = join(work, "target");
      await writeFile(target, "");
      await symlink(target, join(work, ".mcp.json"));
      await placeholders.release(work);
      expect((await lstat(join(work, ".npmrc"))).isDirectory()).toBe(true);
      expect((await lstat(join(work, ".mcp.json"))).isSymbolicLink()).toBe(true);
      expect(await exists(target)).toBe(true);
    });

    it("keeps the files until the last of two overlapping sessions closes", async () => {
      await placeholders.hold(work);
      await stampPlaceholders();
      // The second session finds the files srt made for the first one already there.
      await placeholders.hold(work);
      await placeholders.release(work);
      expect(await exists(join(work, ".npmrc"))).toBe(true);
      await placeholders.release(work);
      expect(await exists(join(work, ".npmrc"))).toBe(false);
    });

    it("counts the working folder as Windows names it, whatever the letter case", async () => {
      await placeholders.hold(work);
      await stampPlaceholders();
      await placeholders.hold(work.toUpperCase());
      await placeholders.release(work);
      expect(await exists(join(work, ".npmrc"))).toBe(true);
    });

    it("removes nothing on a release with no hold, and doesn't count below zero", async () => {
      await stampPlaceholders();
      expect(await placeholders.release(work)).toEqual([]);
      expect(await exists(join(work, ".npmrc"))).toBe(true);
      await rm(join(work, ".npmrc"));
      await placeholders.hold(work);
      await stampPlaceholders();
      await placeholders.release(work);
      expect(await exists(join(work, ".npmrc"))).toBe(false);
    });

    it("notes the files of a session that opens while another one's are being removed", async () => {
      await placeholders.hold(work);
      await stampPlaceholders();
      const released = placeholders.release(work);
      const held = placeholders.hold(work);
      await Promise.all([released, held]);
      // The removal ran first, so the new session saw the files missing and srt makes them again.
      await stampPlaceholders();
      await placeholders.release(work);
      expect(await exists(join(work, ".npmrc"))).toBe(false);
    });

    it("removes the folder srt made on the way to a two-name entry, such as .yarn (HAL-16291)", async () => {
      await placeholders.hold(work);
      await stampYarn();
      expect(await placeholders.release(work)).toEqual([]);
      expect(await exists(join(work, ".yarn"))).toBe(false);
    });

    it("keeps a folder made on the way that holds something else, and removes only the empty files", async () => {
      await placeholders.hold(work);
      await stampYarn();
      await writeFile(join(work, ".yarn", "install-state.gz"), "state");
      await placeholders.release(work);
      expect(await readdir(join(work, ".yarn"))).toEqual(["install-state.gz"]);
    });

    it("keeps a folder that was there before the session opened", async () => {
      await mkdir(join(work, ".yarn"));
      await placeholders.hold(work);
      await stampYarn();
      await placeholders.release(work);
      expect(await readdir(join(work, ".yarn"))).toEqual([]);
    });

    it("keeps a tool folder Halonic made and removes the empty files srt made in it", async () => {
      await placeholders.hold(work);
      // `prepareToolFolders` makes `.claude` after the hold, then srt stamps the files in it.
      await mkdir(join(work, ".claude"));
      await stamp(".claude", "settings.json");
      await placeholders.release(work);
      expect(await readdir(join(work, ".claude"))).toEqual([]);
    });

    it("keeps a link put where a folder was missing, and what it points to", async () => {
      await placeholders.hold(work);
      const target = join(work, "target");
      await mkdir(target);
      await symlink(target, join(work, ".yarn"));
      await placeholders.release(work);
      expect((await lstat(join(work, ".yarn"))).isSymbolicLink()).toBe(true);
      expect(await exists(target)).toBe(true);
    });

    it("reports a folder it can't remove instead of failing", async () => {
      const locked = new DenyPlaceholders({
        file: unlink,
        folder: () => Promise.reject(new Error("the folder is in use")),
      });
      await locked.hold(work);
      await stampYarn();
      expect(await locked.release(work)).toEqual([`${join(work, ".yarn")}: the folder is in use`]);
      expect(await exists(join(work, ".yarn", "releases"))).toBe(false);
    });

    it("reports a file it can't remove instead of failing", async () => {
      const locked = new DenyPlaceholders({
        file: () => Promise.reject(new Error("the file is in use")),
        folder: rmdir,
      });
      await locked.hold(work);
      await stampPlaceholders();
      const failed = await locked.release(work);
      expect(failed).toHaveLength(3);
      expect(failed.join("\n")).toContain(`${join(work, ".npmrc")}: the file is in use`);
    });
  });
});
