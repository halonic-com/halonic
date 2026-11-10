import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { isAbsolutePath } from "./absolute-path.ts";
import { findProgram, programCandidates } from "./find-program.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

// Ported from the git adapter's find-git tests (HAL-2607), which came from
// the desktop's git-guard, `limited_run_tests.rs`
// (`git_process_finds_git_only_in_absolute_folders`). The program names
// and the absolute-name cases are new.

afterAll(removeTempFolders);

async function folderWith(name: string, executable: boolean): Promise<string> {
  const folder = await tempFolder();
  await writeFile(join(folder, name), "");
  await chmod(join(folder, name), executable ? 0o755 : 0o644);
  return folder;
}

// An invented Windows PATH: a drive-relative folder, a root-relative one,
// an empty entry and the current folder, then a drive folder and a share.
const drive = "C:\\Acme\\bin"; // leak-guard: allow absolute-path an invented Windows folder
const share = "\\\\server\\share\\bin";
const windowsPath = ["C:acme", "\\acme", "", ".", "bin", drive, share].join(";");

// These read this computer's folders as POSIX ones, with an execute bit.
// On Windows the pure programCandidates cases below cover the same rules.
const onWindows = process.platform === "win32";

verifies("system-node.find-program", () => {
  describe.skipIf(onWindows)(
    "[platform:win32] has no execute bit and no POSIX folders: findProgram",
    () => {
      it("takes the first absolute folder that has an executable program, in PATH order", async () => {
        const notExecutable = await folderWith("acme", false);
        const first = await folderWith("acme", true);
        const second = await folderWith("acme", true);
        const path = ["", "bin", ".", notExecutable, first, second].join(":");
        expect(await findProgram("acme", { path, platform: "linux" })).toBe(join(first, "acme"));
      });

      it("skips a folder whose program is a folder", async () => {
        const folder = await tempFolder();
        await mkdir(join(folder, "acme"));
        expect(await findProgram("acme", { path: folder, platform: "linux" })).toBeUndefined();
      });

      it("never finds a program through a relative folder, which would be read against the workspace", async () => {
        const folder = await folderWith("acme", true);
        const path = [relative(process.cwd(), folder), "bin", ".", ".."].join(":");
        expect(await findProgram("acme", { path, platform: "linux" })).toBeUndefined();
      });

      it("checks an absolute name and gives it back as it is", async () => {
        const program = join(await folderWith("acme", true), "acme");
        expect(await findProgram(program, { path: "", platform: "linux" })).toBe(program);
        const notExecutable = join(await folderWith("acme", false), "acme");
        expect(await findProgram(notExecutable, { path: "", platform: "linux" })).toBeUndefined();
      });

      it("never finds a relative name with a folder, such as ./acme", async () => {
        const folder = await folderWith("acme", true);
        const name = `./${relative(process.cwd(), join(folder, "acme"))}`;
        expect(await findProgram(name, { path: folder, platform: "linux" })).toBeUndefined();
      });

      it("finds nothing for an empty name", async () => {
        const folder = await folderWith("acme", true);
        expect(await findProgram("", { path: folder, platform: "linux" })).toBeUndefined();
      });
    },
  );

  it("reads process.env.PATH when no PATH is given", async () => {
    const node = onWindows ? "node.exe" : "node";
    expect(await findProgram("node")).toMatch(new RegExp(`[\\\\/]${node}$`, "u"));
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
      const folder = await folderWith("acme.exe", true);
      const path = ["", ".", relative(process.cwd(), folder)].join(";");
      expect(await findProgram("acme", { path, platform: "win32" })).toBeUndefined();
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
