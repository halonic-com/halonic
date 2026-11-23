import { execFileSync } from "node:child_process";
import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { removeTestFolders, testFolders } from "./folders.test-helper.ts";
import { allowedFile, allowedPath } from "./folders.ts";
import { ToolRefusal } from "./tool-input.ts";

afterEach(removeTestFolders);

/** The refusal `allowedFile` gives, or a failure when it allows the path. */
async function refusalOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ToolRefusal) return error.message;
    throw error;
  }
  throw new Error("The path was allowed.");
}

verifies("coding-tools.paths", () => {
  it("allows a file in the working folder and names it relative to it", async () => {
    const folders = await testFolders();
    const real = await folders.write("src/a.ts", "export {};\n");
    const allowed = await allowedFile("src/a.ts", folders, "working-folder");
    expect(allowed).toEqual({ real, shown: "src/a.ts", size: 11 });
    expect((await allowedPath(".", folders, "working-folder")).shown).toBe(".");
  });

  describe("attacks", () => {
    it("refuses a path that climbs out with ..", async () => {
      const folders = await testFolders();
      await writeFile(join(folders.outside, "notes.txt"), "kept out");
      const message = await refusalOf(
        allowedFile("../outside/notes.txt", folders, "working-folder"),
      );
      expect(message).toContain("outside the working folder");
    });

    it("refuses an absolute path outside", async () => {
      const folders = await testFolders();
      const secret = join(folders.outside, "notes.txt");
      await writeFile(secret, "kept out");
      expect(await refusalOf(allowedFile(secret, folders, "working-folder"))).toContain("outside");
    });

    it("refuses a link that leads outside", async () => {
      const folders = await testFolders();
      await writeFile(join(folders.outside, "notes.txt"), "kept out");
      await symlink(folders.outside, join(folders.workingFolder, "door"), "junction");
      const message = await refusalOf(allowedFile("door/notes.txt", folders, "working-folder"));
      expect(message).toContain("outside");
    });

    it.each([
      "C:\\Windows\\win.ini", // leak-guard: allow absolute-path an attack path, never read
      "\\\\server\\share\\notes.txt",
    ])("never reads the Windows path %s", async (path) => {
      const folders = await testFolders();
      // On Windows it is outside; elsewhere it is an odd name in the working folder that isn't there.
      expect(await refusalOf(allowedFile(path, folders, "working-folder"))).toMatch(
        /outside|isn't there/,
      );
    });

    it.skipIf(process.platform === "win32")(
      "refuses a named pipe instead of waiting on it",
      async () => {
        const folders = await testFolders();
        execFileSync("mkfifo", [join(folders.workingFolder, "pipe")], { windowsHide: true });
        expect(await refusalOf(allowedFile("pipe", folders, "working-folder"))).toContain(
          "plain file",
        );
      },
    );
  });

  it("refuses a missing path and a folder", async () => {
    const folders = await testFolders();
    await folders.write("src/a.ts", "");
    expect(await refusalOf(allowedFile("nope.ts", folders, "working-folder"))).toContain(
      "isn't there",
    );
    expect(await refusalOf(allowedFile("src", folders, "working-folder"))).toContain("folder");
  });

  it("allows the test log folder only where the scope says so", async () => {
    const folders = await testFolders();
    const log = join(folders.testLogFolder, "run-1.log");
    await writeFile(log, "FAIL\n");
    expect((await allowedFile(log, folders, "working-folder-or-test-logs")).shown).toBe(log);
    expect(await refusalOf(allowedFile(log, folders, "working-folder"))).toContain("outside");
  });
});
