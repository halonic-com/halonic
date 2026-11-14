import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { boxPolicy, boxRequest } from "./box-policy.ts";
import { MemoryDisk } from "./memory-disk.test-helper.ts";

// Made-up Windows paths: the policy never touches a real disk here.
const work = "C:\\acme\\work"; // leak-guard: allow absolute-path made-up Windows path for a test
const temp = "C:\\acme\\temp"; // leak-guard: allow absolute-path made-up Windows path for a test
const settings = "C:\\acme\\settings"; // leak-guard: allow absolute-path made-up Windows path for a test
const socketFile = "C:\\acme\\bridge.sock"; // leak-guard: allow absolute-path made-up Windows path for a test
const sibling = "C:\\acme\\work-two"; // leak-guard: allow absolute-path made-up Windows path for a test
const tools = "C:\\acme\\tools"; // leak-guard: allow absolute-path made-up Windows path for a test

const profile: SandboxProfile = {
  workingFolder: work,
  tempFolder: temp,
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 1000,
};

function disk(): MemoryDisk {
  return new MemoryDisk().folder(work).folder(tools);
}

verifies("sandbox-mxc.box-request", () => {
  describe("boxPolicy: files", () => {
    it("grants the working, temp and settings folders to write, and the read-only folders to read", async () => {
      const policy = await boxPolicy(
        {
          ...profile,
          settingsFolder: "c:/acme/settings/",
          readOnlyPaths: [`${tools}\\`],
          deniedPaths: ["C:\\acme\\keys\\id.txt"], // leak-guard: allow absolute-path made-up Windows path for a test
        },
        disk(),
      );
      expect(policy).toMatchObject({
        workingFolder: work,
        readWriteFolders: [work, temp, settings],
        readOnlyFolders: [tools],
        deniedPaths: ["C:\\acme\\keys\\id.txt"], // leak-guard: allow absolute-path made-up Windows path for a test
      });
    });

    it("makes the temp and settings folders when they aren't there", async () => {
      const files = disk();
      await boxPolicy({ ...profile, settingsFolder: settings }, files);
      expect(await files.kind(temp)).toBe("folder");
      expect(await files.kind(settings)).toBe("folder");
    });

    it("keeps a read-only file apart from the folders, since MXC grants only folders", async () => {
      const file = `${tools}\\config.json`;
      const files = disk().file(file);
      const policy = await boxPolicy({ ...profile, readOnlyPaths: [file] }, files);
      expect(policy).toMatchObject({ readOnlyFolders: [], readOnlyFiles: [file] });
      expect(boxRequest(policy, { program: "tool.exe", args: [] }, 1000).filesystem).toMatchObject({
        readonlyPaths: [],
      });
    });

    it.each([
      ["a drive root as the temp folder", { tempFolder: "C:\\" }],
      ["a relative working folder", { workingFolder: "work" }],
      ["a working folder that isn't there", { workingFolder: "C:\\acme\\gone" }], // leak-guard: allow absolute-path made-up Windows path for a test
    ])("refuses %s", async (_what, change) => {
      await expect(boxPolicy({ ...profile, ...change }, disk())).rejects.toThrow();
    });

    it("refuses a working folder that is a file", async () => {
      const files = new MemoryDisk().file(work);
      await expect(boxPolicy(profile, files)).rejects.toThrow("isn't a folder");
    });

    it("refuses reopened paths: MXC's denied paths win over every grant", async () => {
      await expect(
        boxPolicy({ ...profile, reopenedPaths: ["C:\\acme\\data\\run"] }, disk()), // leak-guard: allow absolute-path made-up Windows path for a test
      ).rejects.toThrow("reopenedPaths");
    });
  });

  describe("boxPolicy: network", () => {
    it("makes the bridge MXC's proxy: nothing leaves, and no egress rule", async () => {
      const { network } = await boxPolicy(profile, disk());
      expect(network).toEqual({
        egress: { default: "deny" },
        ingress: { default: "allow", hostLoopback: "allow" },
        runtimeConfig: { networkProxy: "http://127.0.0.1:4100" },
      });
    });

    it("opens no loopback at all without a bridge", async () => {
      const { network } = await boxPolicy(
        { ...profile, network: { bridge: null, allowedSites: [] } },
        disk(),
      );
      expect(network).toEqual({
        egress: { default: "deny" },
        ingress: { default: "deny", hostLoopback: "deny" },
      });
    });

    it.each([
      [
        "a site",
        { bridge: profile.network.bridge, allowedSites: ["registry.npmjs.org"] },
        /allowedSites/,
      ],
      [
        "localhost as the bridge's host",
        { bridge: { kind: "loopback" as const, host: "localhost", port: 4100 }, allowedSites: [] },
        /127\.0\.0\.1/,
      ],
      [
        "::1 as the bridge's host",
        { bridge: { kind: "loopback" as const, host: "::1", port: 4100 }, allowedSites: [] },
        /127\.0\.0\.1/,
      ],
      [
        "a bridge on a socket",
        {
          bridge: {
            kind: "socket" as const,
            name: "bridge.halonic.invalid",
            socketPath: socketFile,
          },
          allowedSites: [],
        },
        /loopback bridge/,
      ],
      [
        "a bridge port of 0",
        { bridge: { kind: "loopback" as const, host: "127.0.0.1", port: 0 }, allowedSites: [] },
        /port number/,
      ],
    ])("refuses %s", async (_what, network, sentence) => {
      await expect(boxPolicy({ ...profile, network }, disk())).rejects.toThrow(sentence);
    });
  });

  describe("boxPolicy: environment", () => {
    it("gives only the profile's variables, TEMP and TMP as the temp folder, SYSTEMROOT and LOCALAPPDATA that MXC needs, and the Node flags", async () => {
      vi.stubEnv("SystemRoot", "C:\\TestWindows"); // leak-guard: allow absolute-path made-up Windows path for a test
      const { environment } = await boxPolicy(
        { ...profile, env: { CLAUDE_CONFIG_DIR: "C:\\acme\\settings", Temp: "C:\\elsewhere" } }, // leak-guard: allow absolute-path made-up Windows path for a test
        disk(),
      );
      expect(environment).toEqual({
        CLAUDE_CONFIG_DIR: "C:\\acme\\settings", // leak-guard: allow absolute-path made-up Windows path for a test
        TEMP: temp,
        TMP: temp,
        SYSTEMROOT: "C:\\TestWindows", // leak-guard: allow absolute-path made-up Windows path for a test
        LOCALAPPDATA: temp,
        NODE_OPTIONS: "--preserve-symlinks --preserve-symlinks-main",
      });
      vi.unstubAllEnvs();
    });

    it("keeps the profile's own SYSTEMROOT and LOCALAPPDATA, whatever their case", async () => {
      const { environment } = await boxPolicy(
        { ...profile, env: { SystemRoot: "D:\\W", localappdata: "D:\\L" } }, // leak-guard: allow absolute-path made-up Windows path for a test
        disk(),
      );
      expect(environment["SystemRoot"]).toBe("D:\\W"); // leak-guard: allow absolute-path made-up Windows path for a test
      expect(environment["localappdata"]).toBe("D:\\L"); // leak-guard: allow absolute-path made-up Windows path for a test
      expect(Object.keys(environment).filter((n) => /^(systemroot|localappdata)$/i.test(n))).toHaveLength(2);
    });

    it("keeps the host's variables out", async () => {
      vi.stubEnv("MXC_TEST_SECRET", "from-the-host");
      try {
        const { environment } = await boxPolicy(profile, disk());
        expect(Object.keys(environment)).not.toContain("MXC_TEST_SECRET");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("adds the flags to the profile's own NODE_OPTIONS, once", async () => {
      const { environment } = await boxPolicy(
        { ...profile, env: { node_options: "--max-old-space-size=512 --preserve-symlinks" } },
        disk(),
      );
      expect(Object.entries(environment)).toContainEqual([
        "node_options",
        "--max-old-space-size=512 --preserve-symlinks --preserve-symlinks-main",
      ]);
    });

    it.each(["", "A=B", "A B"])("refuses the variable name %j", async (name) => {
      await expect(boxPolicy({ ...profile, env: { [name]: "x" } }, disk())).rejects.toThrow(
        "can't be passed on",
      );
    });
  });

  describe("boxRequest", () => {
    it("turns the UI policy on without clipboard or input injection, and passes no denial capture", async () => {
      const request = boxRequest(
        await boxPolicy(profile, disk()),
        { program: "git", args: ["status"] },
        5000,
      );
      expect(request.ui).toEqual({ disable: false, clipboard: "none", allowInputInjection: false });
      expect(request).not.toHaveProperty("captureDenials");
      expect(request.network.egress).toEqual({ default: "deny" });
      expect(request).toMatchObject({
        command: "git status",
        workingDirectory: work,
        inheritDefaultEnvironment: false,
        timeoutMs: 5000,
      });
    });

    it("hands MXC the grants in its three lists", async () => {
      const policy = await boxPolicy({ ...profile, readOnlyPaths: [tools] }, disk());
      expect(boxRequest(policy, { program: "git", args: [] }, 1).filesystem).toEqual({
        readonlyPaths: [tools],
        readwritePaths: [work, temp],
        deniedPaths: [],
      });
    });

    it("starts in a folder inside the working folder, and nowhere else", async () => {
      const policy = await boxPolicy(profile, disk());
      expect(
        boxRequest(policy, { program: "git", args: [], cwd: "src/app" }, 1).workingDirectory,
      ).toBe(`${work}\\src\\app`);
      expect(() => boxRequest(policy, { program: "git", args: [], cwd: "..\\other" }, 1)).toThrow(
        "inside the working folder",
      );
      expect(() => boxRequest(policy, { program: "git", args: [], cwd: sibling }, 1)).toThrow(
        // leak-guard: allow absolute-path made-up Windows path for a test
        "inside the working folder",
      );
    });

    it("never gives the time limit as less than a millisecond", async () => {
      const policy = await boxPolicy(profile, disk());
      expect(boxRequest(policy, { program: "git", args: [] }, -5).timeoutMs).toBe(1);
    });
  });
});
