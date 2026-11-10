import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { computer, windowsPath } from "./fake-runners.spec.ts";
import { findRunner } from "./find-runner.ts";

verifies("mcp.runner-lookup", () => {
  describe("on macOS and Linux", () => {
    it("finds the runner and node in the app's PATH, skipping relative entries", async () => {
      const search = computer(["./npx", "/acme/node/bin/npx", "/acme/node/bin/node"], {
        platform: "linux",
        path: ".::/usr/bin:/acme/node/bin",
      });
      expect(await findRunner("npx", "npm", search)).toEqual({
        found: { program: "/acme/node/bin/npx", leadingArgs: [], pathFolders: ["/acme/node/bin"] },
      });
    });

    it("on macOS, looks in the login shell's PATH after the short one a desktop app inherits", async () => {
      const files = ["/acme/.volta/bin/npx", "/acme/.volta/bin/node", "/opt/homebrew/bin/npx"];
      const search = computer(files, {
        platform: "darwin",
        path: "/usr/bin:/bin",
        loginShellPath: async () => "/acme/.volta/bin:/usr/bin",
      });
      expect(await findRunner("npx", "npm", search)).toMatchObject({
        found: { program: "/acme/.volta/bin/npx" },
      });
    });

    it("then in the usual install folders, and puts node's own folder on PATH too", async () => {
      const search = computer(["/opt/homebrew/bin/npx", "/acme/home/.local/bin/node"], {
        platform: "darwin",
        path: "/usr/bin",
        home: "/acme/home",
      });
      expect(await findRunner("npx", "npm", search)).toEqual({
        found: {
          program: "/opt/homebrew/bin/npx",
          leadingArgs: [],
          pathFolders: ["/opt/homebrew/bin", "/acme/home/.local/bin"],
        },
      });
    });

    it("finds a Python runner without looking for node, and takes a command with a folder as written", async () => {
      const search = computer(["/acme/home/.local/bin/uvx", "/acme/tools/uvx"], {
        platform: "linux",
        path: "",
        home: "/acme/home",
      });
      expect(await findRunner("uvx", "pypi", search)).toMatchObject({
        found: { program: "/acme/home/.local/bin/uvx", pathFolders: ["/acme/home/.local/bin"] },
      });
      expect(await findRunner("/acme/tools/uvx", "pypi", search)).toMatchObject({
        found: { program: "/acme/tools/uvx" },
      });
    });

    it("refuses a relative command with a folder, without looking for it", async () => {
      const search = computer(["/acme/app/bin/uvx", "/acme/app/npx"], {
        platform: "linux",
        path: "/acme/app",
      });
      for (const command of ["bin/uvx", "./npx", "../app/npx"]) {
        expect(await findRunner(command, "pypi", search)).toEqual({
          refused: `"${command}" is a path relative to the folder the app runs in; give its full path or just the program's name`,
        });
      }
    });

    it("refuses, by name, a runner or a node it can't find", async () => {
      const none = computer([], { platform: "linux", path: "/usr/bin" });
      expect(await findRunner("npx", "npm", none)).toEqual({
        refused:
          "couldn't find \"npx\" on this computer; give its full path as the connector's command",
      });
      const noNode = computer(["/usr/bin/npx"], { platform: "linux", path: "/usr/bin" });
      expect(await findRunner("npx", "npm", noNode)).toEqual({
        refused:
          'couldn\'t find "node" on this computer, which "npx" needs; give the full path of a "npx" with "node" in the same folder',
      });
    });
  });

  describe("on Windows", () => {
    const nodejs = windowsPath("C", "Program Files", "nodejs");

    it("starts npm's npx.cmd as node.exe with npm's own CLI script, without a shell", async () => {
      const search = computer(
        [
          `${nodejs}\\npx.cmd`,
          `${nodejs}\\node.exe`,
          `${nodejs}\\node_modules\\npm\\bin\\npx-cli.js`,
        ],
        {
          platform: "win32",
          path: `${windowsPath("C", "Windows")};${nodejs}`,
          pathExt: ".COM;.EXE;.BAT;.CMD",
        },
      );
      expect(await findRunner("npx", "npm", search)).toEqual({
        found: {
          program: `${nodejs}\\node.exe`,
          leadingArgs: [`${nodejs}\\node_modules\\npm\\bin\\npx-cli.js`],
          pathFolders: [nodejs],
        },
      });
    });

    it("refuses any other .cmd runner, which only a shell can start", async () => {
      const search = computer([`${nodejs}\\pnpm.cmd`, `${nodejs}\\node.exe`], {
        platform: "win32",
        path: nodejs,
      });
      expect(await findRunner("pnpm", "npm", search)).toEqual({
        refused:
          '"pnpm.cmd" starts only through a shell, which Halonic doesn\'t use for a pinned connector',
      });
    });

    it("starts uvx.exe directly, found in a folder under the home folder, in any letter case", async () => {
      const search = computer([windowsPath("D", "Acme", ".local", "bin", "UVX.EXE")], {
        platform: "win32",
        path: "",
        home: windowsPath("D", "acme"),
        pathExt: ".EXE;.CMD;.PS1",
      });
      expect(await findRunner("uvx", "pypi", search)).toEqual({
        found: {
          program: windowsPath("D", "acme", ".local", "bin", "uvx.exe"),
          leadingArgs: [],
          pathFolders: [windowsPath("D", "acme", ".local", "bin")],
        },
      });
    });

    it("starts npm's npx.cmd with the node.exe it finds when there's none next to it", async () => {
      const appDataNpm = windowsPath("C", "Users", "acme", "AppData", "Roaming", "npm");
      const search = computer(
        [
          `${appDataNpm}\\npx.cmd`,
          `${appDataNpm}\\node_modules\\npm\\bin\\npx-cli.js`,
          `${nodejs}\\node.cmd`,
          `${nodejs}\\node.exe`,
        ],
        { platform: "win32", path: `${appDataNpm};${nodejs}` },
      );
      expect(await findRunner("npx", "npm", search)).toEqual({
        found: {
          program: `${nodejs}\\node.exe`,
          leadingArgs: [`${appDataNpm}\\node_modules\\npm\\bin\\npx-cli.js`],
          pathFolders: [appDataNpm, nodejs],
        },
      });
    });

    it("finds npx.exe and node.exe in Volta's folder under %LOCALAPPDATA%", async () => {
      const volta = windowsPath("C", "Users", "acme", "AppData", "Local", "Volta", "bin");
      const search = computer([`${volta}\\npx.exe`, `${volta}\\node.exe`], {
        platform: "win32",
        path: "",
        appData: windowsPath("C", "Users", "acme", "AppData", "Roaming"),
        localAppData: windowsPath("C", "Users", "acme", "AppData", "Local"),
      });
      expect(await findRunner("npx", "npm", search)).toEqual({
        found: { program: `${volta}\\npx.exe`, leadingArgs: [], pathFolders: [volta] },
      });
    });

    it("starts a Scoop shim directly, looking in Scoop's folder before .local\\bin", async () => {
      const shims = windowsPath("D", "acme", "scoop", "shims");
      const search = computer(
        [`${shims}\\uvx.exe`, windowsPath("D", "acme", ".local", "bin", "uvx.exe")],
        {
          platform: "win32",
          path: "",
          home: windowsPath("D", "acme"),
        },
      );
      expect(await findRunner("uvx", "pypi", search)).toEqual({
        found: { program: `${shims}\\uvx.exe`, leadingArgs: [], pathFolders: [shims] },
      });
    });

    it("tries a full path without an ending with each PATHEXT ending, and refuses a relative one", async () => {
      const tools = windowsPath("C", "tools");
      const search = computer([`${tools}\\uvx.exe`], { platform: "win32", path: "" });
      expect(await findRunner(`${tools}\\uvx`, "pypi", search)).toMatchObject({
        found: { program: `${tools}\\uvx.exe` },
      });
      for (const command of ["tools\\uvx", "\\tools\\uvx", "C:uvx"]) {
        expect(await findRunner(command, "pypi", search)).toMatchObject({
          refused: expect.stringContaining("is a path relative to the folder the app runs in"),
        });
      }
    });

    it("takes a PATH folder in quotes, as some installers write it", async () => {
      const search = computer([`${nodejs}\\uvx.exe`], {
        platform: "win32",
        path: `"${nodejs}"`,
      });
      expect(await findRunner("uvx", "pypi", search)).toMatchObject({
        found: { program: `${nodejs}\\uvx.exe` },
      });
    });
  });
});
