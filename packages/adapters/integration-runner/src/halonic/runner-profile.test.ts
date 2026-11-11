import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { readRunnerArgs } from "../runner-args.ts";
import { runnerCommand } from "./runner-command.ts";
import {
  hiddenAround,
  isInsideOrSame,
  type RunnerDisk,
  type RunnerFiles,
  realRunnerPaths,
  runnerProfile,
  socketFolders,
} from "./runner-profile.ts";

/** A small file tree: each folder with its names. */
const tree: Record<string, string[]> = {
  "/fake-home": [".ssh", ".config", "code", ".nvm"],
  "/fake-home/code": ["weather", "other-project"],
  "/fake-home/.nvm": ["versions", "alias"],
  "/fake-home/.nvm/versions": ["node"],
  "/fake-home/.nvm/versions/node": ["v26.0.0", "v24.1.0"],
  "/shared-tmp": ["halonic-run-1", "someone-elses.sock"],
};
/** Symlinks in the tree, and where they point. */
const links: Record<string, string> = {
  "/fake-home/.nvm/alias": "/fake-home/.nvm/versions/node/v26.0.0",
  "/fake-home/code/other-project": "/elsewhere/other-project",
  "/var/run": "/run",
};
const listFolder = (folder: string) => tree[folder] ?? [];
const disk: RunnerDisk = { listFolder, realPath: (path) => links[path] ?? path };

const files: RunnerFiles = {
  node: "/fake-home/.nvm/versions/node/v26.0.0/bin/node",
  nodeFolder: "/fake-home/.nvm/versions/node/v26.0.0",
  runnerFile: "/opt/halonic/runner.js",
  integrationFolder: "/fake-home/code/weather",
};
const machine = {
  homeFolder: "/fake-home",
  socketFolders: ["/run", "/shared-tmp"],
  tempFolder: "/shared-tmp/halonic-run-1",
  timeLimitMs: 60_000,
};

verifies("integration-runner.start", () => {
  describe("runnerProfile", () => {
    const profile = runnerProfile(files, machine, disk);

    it("hides the home folder except the way to the integration and to Node", () => {
      expect(profile.deniedPaths).toEqual(
        expect.arrayContaining([
          "/fake-home/.ssh",
          "/fake-home/.config",
          "/fake-home/code/other-project",
          "/fake-home/.nvm/versions/node/v24.1.0",
        ]),
      );
      for (const kept of [
        files.integrationFolder,
        files.nodeFolder,
        "/fake-home",
        "/fake-home/code",
      ]) {
        expect(profile.deniedPaths).not.toContain(kept);
      }
    });

    it("leaves a symlink into Node's folder, because hiding it would hide Node's folder too", () => {
      expect(profile.deniedPaths).not.toContain("/fake-home/.nvm/alias");
    });

    it("hides the socket folders, except its own temp folder in a shared one", () => {
      expect(profile.deniedPaths).toContain("/run");
      expect(profile.deniedPaths).toContain("/shared-tmp/someone-elses.sock");
      expect(profile.deniedPaths).not.toContain("/shared-tmp");
      expect(profile.deniedPaths).not.toContain(machine.tempFolder);
    });

    it("gives no network, writes only to the temp folder and an environment of TMPDIR alone", () => {
      expect(profile.network).toEqual({ bridge: null, allowedSites: [] });
      expect(profile.workingFolder).toBe(machine.tempFolder);
      expect(profile.tempFolder).toBe(machine.tempFolder);
      expect(profile.settingsFolder).toBeNull();
      expect(profile.env).toEqual({ TMPDIR: machine.tempFolder });
      expect(profile.readOnlyPaths).toEqual([
        files.nodeFolder,
        files.runnerFile,
        files.integrationFolder,
      ]);
      expect(profile.timeLimitMs).toBe(machine.timeLimitMs);
    });
  });

  describe("runnerProfile refusals", () => {
    it.each([
      ["Node's folder", { ...files, nodeFolder: "/" }, machine],
      ["Node's folder", { ...files, nodeFolder: "/fake-home" }, machine],
      ["runner file", { ...files, runnerFile: "/run" }, machine],
      ["integration's folder", { ...files, integrationFolder: "/fake-home" }, machine],
      ["integration's folder", { ...files, integrationFolder: "/shared-tmp" }, machine],
      ["temp folder", files, { ...machine, tempFolder: "/shared-tmp" }],
    ])("refuses a %s that is or holds a folder to hide", (name, someFiles, someMachine) => {
      expect(() => runnerProfile(someFiles, someMachine, disk)).toThrow(`the ${name} `);
    });

    it("fails when a folder on the way to a kept path can't be listed", () => {
      const unreadable = (folder: string) => {
        if (folder === "/fake-home/code") throw new Error("EACCES");
        return listFolder(folder);
      };
      expect(() => runnerProfile(files, machine, { ...disk, listFolder: unreadable })).toThrow(
        "EACCES",
      );
    });

    it("fails on disk when a folder on the way is missing", () => {
      const missing = "/halonic-test-missing-folder";
      expect(() => hiddenAround(missing, [`${missing}/integration`])).toThrow(
        `can't list ${missing}`,
      );
    });
  });

  describe("realRunnerPaths", () => {
    it("resolves every path, and keeps a folder to hide that doesn't exist as written", () => {
      const missing = (path: string) => {
        if (path === "/no-xdg") throw new Error("ENOENT");
        return disk.realPath(path);
      };
      const real = realRunnerPaths(
        { ...files, nodeFolder: "/fake-home/.nvm/alias" },
        { ...machine, socketFolders: ["/run", "/var/run", "/no-xdg"] },
        { ...disk, realPath: missing },
      );
      expect(real.files.nodeFolder).toBe("/fake-home/.nvm/versions/node/v26.0.0");
      expect(real.machine.socketFolders).toEqual(["/run", "/no-xdg"]);
    });

    it("fails when a path the runner needs can't be resolved", () => {
      const noRunner = (path: string) => {
        if (path === files.runnerFile) throw new Error("ENOENT");
        return path;
      };
      expect(() => realRunnerPaths(files, machine, { ...disk, realPath: noRunner })).toThrow(
        `can't find the runner file ${files.runnerFile}`,
      );
    });
  });

  describe("runnerProfile on disk", () => {
    // Node's folder through a symlink, as with `~/.nvm/current` or a Homebrew link.
    const base = realpathSync.native(mkdtempSync(join(tmpdir(), "halonic-runner-profile-")));
    afterAll(() => rmSync(base, { recursive: true, force: true }));
    const home = join(base, "home");
    const realNode = join(home, ".nvm", "versions", "node", "v26.0.0");
    for (const folder of [
      join(realNode, "bin"),
      join(home, ".ssh"),
      join(home, "code", "weather"),
    ]) {
      mkdirSync(folder, { recursive: true });
    }
    mkdirSync(join(base, "opt"));
    mkdirSync(join(base, "run", "halonic-run-1"), { recursive: true });
    writeFileSync(join(realNode, "bin", "node"), "");
    writeFileSync(join(base, "opt", "runner.js"), "");
    // A junction on Windows, which needs no admin rights; other systems ignore the type.
    symlinkSync(realNode, join(home, ".nvm", "current"), "junction");
    const linked = realRunnerPaths(
      {
        node: join(home, ".nvm", "current", "bin", "node"),
        nodeFolder: join(home, ".nvm", "current"),
        runnerFile: join(base, "opt", "runner.js"),
        integrationFolder: join(home, "code", "weather"),
      },
      {
        homeFolder: home,
        socketFolders: [join(base, "run")],
        tempFolder: join(base, "run", "halonic-run-1"),
        timeLimitMs: 60_000,
      },
    );
    const profile = runnerProfile(linked.files, linked.machine);

    it("keeps Node's real folder readable and the symlink to it unhidden", () => {
      expect(linked.files.nodeFolder).toBe(realNode);
      expect(linked.files.node).toBe(join(realNode, "bin", "node"));
      expect(profile.readOnlyPaths).toContain(realNode);
      expect(profile.deniedPaths).toContain(join(home, ".ssh"));
      expect(profile.deniedPaths).not.toContain(join(home, ".nvm", "current"));
    });

    it("denies no real place that is or holds a path the runner needs", () => {
      const kept = [...profile.readOnlyPaths, profile.tempFolder];
      for (const denied of profile.deniedPaths.flatMap((path) => [
        path,
        realpathSync.native(path),
      ])) {
        for (const path of kept) {
          expect(isInsideOrSame(path, denied), `${denied} hides ${path}`).toBe(false);
        }
      }
    });
  });

  describe("hiddenAround", () => {
    it("hides a folder as a whole when nothing kept is inside it", () => {
      expect(hiddenAround("/run", ["/fake-home/code/weather"], disk)).toEqual(["/run"]);
    });

    it("hides nothing of a folder inside a kept one", () => {
      expect(hiddenAround("/fake-home/code", ["/fake-home"], disk)).toEqual([]);
    });

    it("doesn't take a sibling with a longer name for the kept folder", () => {
      expect(hiddenAround("/fake-home/code", ["/fake-home/code/weath"], disk)).toEqual([
        "/fake-home/code/weather",
        "/fake-home/code/other-project",
      ]);
    });
  });

  describe("socketFolders", () => {
    it("adds the runtime folder and the folder of the SSH agent's socket", () => {
      expect(
        socketFolders({ XDG_RUNTIME_DIR: "/xdg-runtime", SSH_AUTH_SOCK: "/ssh-agent/agent.1" }),
      ).toEqual(["/run", "/var/run", "/tmp", "/xdg-runtime", "/ssh-agent"]);
    });

    it("leaves out relative paths", () => {
      expect(socketFolders({ XDG_RUNTIME_DIR: "run" })).toEqual(["/run", "/var/run", "/tmp"]);
    });
  });

  describe("runnerCommand", () => {
    it("starts Node with its permission model reading only the runner and the integration", () => {
      const args = {
        nonce: "n-1",
        entryFile: "/fake-home/code/weather/index.js",
        exportName: "weather",
      };
      const command = runnerCommand(files, args);
      expect(command.program).toBe(files.node);
      expect(command.args).toEqual([
        "--permission",
        "--allow-fs-read=/opt/halonic/runner.js",
        "--allow-fs-read=/fake-home/code/weather",
        "/opt/halonic/runner.js",
        "n-1",
        "/fake-home/code/weather/index.js",
        "weather",
      ]);
      expect(readRunnerArgs(command.args.slice(4))).toEqual(args);
    });

    it("refuses runner arguments that are missing or extra", () => {
      expect(() => readRunnerArgs(["n-1", "/a.js"])).toThrow(/three arguments/);
      expect(() => readRunnerArgs(["n-1", "/a.js", "x", "y"])).toThrow(/three arguments/);
      expect(() => readRunnerArgs(["", "/a.js", "x"])).toThrow(/three arguments/);
    });
  });
});
