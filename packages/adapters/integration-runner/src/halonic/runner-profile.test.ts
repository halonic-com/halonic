import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readRunnerArgs } from "../runner-args.ts";
import { runnerCommand } from "./runner-command.ts";
import { hiddenAround, type RunnerFiles, runnerProfile, socketFolders } from "./runner-profile.ts";

/** A small file tree: each folder with its names. */
const tree: Record<string, string[]> = {
  "/fake-home": [".ssh", ".config", "code", ".nvm"],
  "/fake-home/code": ["weather", "other-project"],
  "/fake-home/.nvm": ["versions", "alias"],
  "/fake-home/.nvm/versions": ["node"],
  "/fake-home/.nvm/versions/node": ["v26.0.0", "v24.1.0"],
  "/shared-tmp": ["halonic-run-1", "someone-elses.sock"],
};
const listFolder = (folder: string) => tree[folder] ?? [];

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
    const profile = runnerProfile(files, machine, listFolder);

    it("hides the home folder except the way to the integration and to Node", () => {
      expect(profile.deniedPaths).toEqual(
        expect.arrayContaining([
          "/fake-home/.ssh",
          "/fake-home/.config",
          "/fake-home/code/other-project",
          "/fake-home/.nvm/alias",
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
      expect(() => runnerProfile(someFiles, someMachine, listFolder)).toThrow(`the ${name} `);
    });

    it("fails when a folder on the way to a kept path can't be listed", () => {
      const unreadable = (folder: string) => {
        if (folder === "/fake-home/code") throw new Error("EACCES");
        return listFolder(folder);
      };
      expect(() => runnerProfile(files, machine, unreadable)).toThrow("EACCES");
    });

    it("fails on disk when a folder on the way is missing", () => {
      const missing = "/halonic-test-missing-folder";
      expect(() => hiddenAround(missing, [`${missing}/integration`])).toThrow(
        `can't list ${missing}`,
      );
    });
  });

  describe("hiddenAround", () => {
    it("hides a folder as a whole when nothing kept is inside it", () => {
      expect(hiddenAround("/run", ["/fake-home/code/weather"], listFolder)).toEqual(["/run"]);
    });

    it("hides nothing of a folder inside a kept one", () => {
      expect(hiddenAround("/fake-home/code", ["/fake-home"], listFolder)).toEqual([]);
    });

    it("doesn't take a sibling with a longer name for the kept folder", () => {
      expect(hiddenAround("/fake-home/code", ["/fake-home/code/weath"], listFolder)).toEqual([
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
