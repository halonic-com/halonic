import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  type RealPath,
  type WindowsUserFolders,
  windowsInstallReadPaths,
} from "./install-folders.ts";

/** A made-up Windows path: the drive letter, then the names on the way. */
function windowsPath(drive: string, ...names: string[]): string {
  return [`${drive}:`, ...names].join("\\");
}

const userProfile = windowsPath("C", "Users", "acme");
const programFiles = windowsPath("C", "Program Files");
const appData = `${userProfile}\\AppData\\Roaming`;
const localAppData = `${userProfile}\\AppData\\Local`;
const folders: WindowsUserFolders = { userProfile, halonicData: `${localAppData}\\halonic` };

/**
 * A Windows disk with these links, by path as written in any letter case;
 * every other path is real, except `missing`.
 */
function disk(
  links: Readonly<Record<string, string>> = {},
  missing: readonly string[] = [],
): RealPath {
  const byLowerCase = new Map(Object.entries(links).map(([from, to]) => [from.toLowerCase(), to]));
  return async (path) => {
    if (missing.includes(path)) throw new Error(`ENOENT: ${path}`);
    return byLowerCase.get(path.toLowerCase()) ?? path;
  };
}

verifies("harness-kit.windows-install-folders", () => {
  describe("windowsInstallReadPaths", () => {
    it("names the folder of a harness installed in .local\\bin", async () => {
      const install = { program: `${userProfile}\\.local\\bin\\claude.exe`, packageFolder: null };

      expect(await windowsInstallReadPaths(install, folders, disk())).toEqual([
        `${userProfile}\\.local\\bin`,
      ]);
    });

    it("names nvm's Node folder at its real place, and the npm package's own folder", async () => {
      const install = {
        program: `${programFiles}\\nodejs\\node.exe`,
        packageFolder: `${appData}\\npm\\node_modules\\@openai\\codex`,
      };
      const nvm = disk({
        [`${programFiles}\\nodejs\\node.exe`]: `${appData}\\nvm\\v24.1.0\\node.exe`,
      });

      expect(await windowsInstallReadPaths(install, folders, nvm)).toEqual([
        `${appData}\\nvm\\v24.1.0`,
        `${appData}\\npm\\node_modules\\@openai\\codex`,
      ]);
    });

    it("names fnm's Node folder, not the shell's link to it", async () => {
      const shellLink = `${localAppData}\\fnm_multishells\\1234_5678\\node.exe`;
      const real = `${appData}\\fnm\\node-versions\\v24.1.0\\installation\\node.exe`;
      const install = { program: shellLink, packageFolder: null };

      expect(await windowsInstallReadPaths(install, folders, disk({ [shellLink]: real }))).toEqual([
        `${appData}\\fnm\\node-versions\\v24.1.0\\installation`,
      ]);
    });

    it("never names the user profile, nor the whole npm folder", async () => {
      const install = {
        program: `${appData}\\nvm\\v24.1.0\\node.exe`,
        packageFolder: `${appData}\\npm\\node_modules\\@anthropic-ai\\claude-code`,
      };

      const named = await windowsInstallReadPaths(install, folders, disk());
      expect(named).not.toContain(userProfile);
      expect(named).not.toContain(`${appData}\\npm`);
    });

    it("adds nothing for a harness installed outside the user profile", async () => {
      const install = {
        program: `${programFiles}\\nodejs\\node.exe`,
        packageFolder: `${programFiles}\\nodejs\\node_modules\\@openai\\codex`,
      };

      expect(await windowsInstallReadPaths(install, folders, disk())).toEqual([]);
    });

    it("compares paths in any letter case, and names a folder once", async () => {
      const install = {
        program: windowsPath("c", "users", "ACME", ".local", "bin", "claude.exe"),
        packageFolder: `${userProfile}\\.LOCAL\\bin`,
      };

      expect(await windowsInstallReadPaths(install, folders, disk())).toEqual([
        windowsPath("c", "users", "ACME", ".local", "bin"),
      ]);
    });

    it("compares against the user profile's real place", async () => {
      const movedProfile = windowsPath("D", "Users", "acme");
      const install = { program: `${movedProfile}\\.local\\bin\\claude.exe`, packageFolder: null };
      const moved = disk({ [userProfile]: movedProfile });

      expect(await windowsInstallReadPaths(install, folders, moved)).toEqual([
        `${movedProfile}\\.local\\bin`,
      ]);
    });

    it("compares against where Halonic's data folder will be, before it exists", async () => {
      const movedProfile = windowsPath("D", "Users", "acme");
      const movedData = `${movedProfile}\\AppData\\Local\\halonic`;
      const install = { program: `${movedData}\\agent-host\\node.exe`, packageFolder: null };
      const moved = disk(
        { [userProfile]: movedProfile, [localAppData]: `${movedProfile}\\AppData\\Local` },
        [folders.halonicData],
      );

      await expect(windowsInstallReadPaths(install, folders, moved)).rejects.toThrow(
        /overlaps Halonic's data folder/,
      );
    });

    it("refuses a program straight in the user profile", async () => {
      const install = { program: `${userProfile}\\claude.exe`, packageFolder: null };

      await expect(windowsInstallReadPaths(install, folders, disk())).rejects.toThrow(
        /is the user profile/,
      );
    });

    it("refuses a folder in Halonic's data folder, or one that holds it", async () => {
      const inData = {
        program: `${localAppData}\\halonic\\agent-host\\node.exe`,
        packageFolder: null,
      };
      const holdingData = { program: `${localAppData}\\claude.exe`, packageFolder: null };

      await expect(windowsInstallReadPaths(inData, folders, disk())).rejects.toThrow(
        /overlaps Halonic's data folder/,
      );
      await expect(windowsInstallReadPaths(holdingData, folders, disk())).rejects.toThrow(
        /overlaps Halonic's data folder/,
      );
    });

    it("refuses an install it can't find", async () => {
      const program = `${userProfile}\\.local\\bin\\claude.exe`;

      await expect(
        windowsInstallReadPaths({ program, packageFolder: null }, folders, disk({}, [program])),
      ).rejects.toThrow(`can't find the harness's program ${program}`);
    });
  });
});
