import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { isAbsolutePath } from "./absolute-path.ts";
import { findProgram, programCandidates } from "./find-program.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

// Ported from the git adapter's find-git tests (HAL-2607), which came from
// the desktop's git-guard, `limited_run_tests.rs`
// (`git_process_finds_git_only_in_absolute_folders`). The program names,
// the absolute-name cases and the current-folder cases are new.

afterAll(removeTempFolders);

const onWindows = process.platform === "win32";

/** The program's file name on this computer: Windows looks only for `.exe`. */
const acmeFile = onWindows ? "acme.exe" : "acme";

async function folderWith(name: string, executable: boolean): Promise<string> {
  const folder = await tempFolder();
  await writeFile(join(folder, name), "");
  await chmod(join(folder, name), executable ? 0o755 : 0o644);
  return folder;
}

/**
 * Runs `test` with an executable `name` in the current folder, the one a
 * bare name or a relative PATH folder would be read against, and removes
 * it afterwards. Only a file there can show it is never chosen.
 */
async function inCurrentFolder(name: string, test: () => Promise<void>): Promise<void> {
  const file = join(process.cwd(), name);
  await writeFile(file, "");
  try {
    await chmod(file, 0o755);
    await test();
  } finally {
    await rm(file, { force: true });
  }
}

// An invented Windows PATH: a drive-relative folder, a root-relative one,
// an empty entry and the current folder, then a drive folder and a share.
const drive = "C:\\Acme\\bin"; // leak-guard: allow absolute-path an invented Windows folder
const share = "\\\\server\\share\\bin";
const windowsPath = ["C:acme", "\\acme", "", ".", "bin", drive, share].join(";");

verifies("system-node.find-program", () => {
  describe("findProgram on this computer", () => {
    it("takes the first absolute folder that has the program, in PATH order", async () => {
      const notExecutable = await folderWith(acmeFile, false);
      const first = await folderWith(acmeFile, true);
      const second = await folderWith(acmeFile, true);
      const path = ["", "bin", ".", notExecutable, first, second].join(delimiter);
      // Windows has no execute bit: there a file named acme.exe is the program.
      const expected = onWindows ? notExecutable : first;
      expect(await findProgram("acme", { path })).toBe(join(expected, acmeFile));
    });

    it("skips a folder whose program is a folder", async () => {
      const folder = await tempFolder();
      await mkdir(join(folder, acmeFile));
      expect(await findProgram("acme", { path: folder })).toBeUndefined();
    });

    it("never finds a program through the current or a relative folder, which may be the workspace", async () => {
      await inCurrentFolder(acmeFile, async () => {
        const path = ["", ".", "bin", ".."].join(delimiter);
        expect(await findProgram("acme", { path })).toBeUndefined();
      });
    });

    it("never finds a relative name with a folder, such as ./acme", async () => {
      await inCurrentFolder(acmeFile, async () => {
        expect(await findProgram(`./${acmeFile}`, { path: process.cwd() })).toBeUndefined();
      });
    });

    it("checks an absolute name and gives it back as it is", async () => {
      const program = join(await folderWith(acmeFile, true), acmeFile);
      expect(await findProgram(program, { path: "" })).toBe(program);
      const missing = join(await tempFolder(), acmeFile);
      expect(await findProgram(missing, { path: "" })).toBeUndefined();
    });

    it("finds nothing for an empty name", async () => {
      const folder = await folderWith(acmeFile, true);
      expect(await findProgram("", { path: folder })).toBeUndefined();
    });

    it("reads process.env.PATH when no PATH is given", async () => {
      const node = onWindows ? "node.exe" : "node";
      expect(await findProgram("node")).toMatch(new RegExp(`[\\\\/]${node}$`, "u"));
    });
  });

  describe("programCandidates on Windows", () => {
    it("never looks in the current folder or a relative one, only in absolute folders", () => {
      expect(programCandidates("acme", windowsPath, "win32")).toEqual([
        `${drive}\\acme.exe`,
        `${share}\\acme.exe`,
      ]);
    });

    it("looks only for <name>.exe, never .cmd or .bat, which need a shell", () => {
      expect(programCandidates("acme.exe", drive, "win32")).toEqual([`${drive}\\acme.exe`]);
      expect(programCandidates("acme.cmd", drive, "win32")).toEqual([`${drive}\\acme.cmd.exe`]);
    });

    it("takes an absolute name only when it is an .exe", () => {
      expect(programCandidates(`${drive}\\acme.EXE`, windowsPath, "win32")).toEqual([
        `${drive}\\acme.EXE`,
      ]);
      expect(programCandidates(`${drive}\\acme.bat`, windowsPath, "win32")).toEqual([]);
    });

    it("never takes a name that the current folder or drive would complete", () => {
      for (const name of [".\\acme", "bin/acme", "C:acme", "\\acme"]) {
        expect(programCandidates(name, windowsPath, "win32")).toEqual([]);
      }
    });

    it("never chooses a program in the current folder, even when it is there", async () => {
      await inCurrentFolder("acme.exe", async () => {
        const path = ["", ".", ".\\"].join(";");
        expect(await findProgram("acme", { path, platform: "win32" })).toBeUndefined();
        expect(await findProgram("acme.exe", { path, platform: "win32" })).toBeUndefined();
      });
    });
  });

  describe("isAbsolutePath", () => {
    it("on Windows takes only a drive with a slash or a share, never C:git or \\git", () => {
      expect(isAbsolutePath(drive, "win32")).toBe(true);
      expect(isAbsolutePath("D:/acme", "win32")).toBe(true);
      expect(isAbsolutePath("\\\\server\\share", "win32")).toBe(true);
      expect(isAbsolutePath("C:acme", "win32")).toBe(false);
      expect(isAbsolutePath("\\acme", "win32")).toBe(false);
      expect(isAbsolutePath("", "win32")).toBe(false);
    });

    it("elsewhere takes only a path from the root", () => {
      expect(isAbsolutePath("/acme/bin", "linux")).toBe(true);
      expect(isAbsolutePath("bin", "linux")).toBe(false);
      expect(isAbsolutePath("", "darwin")).toBe(false);
    });
  });
});
