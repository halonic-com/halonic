import { runTrustCheck } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { MxcCanary } from "./canary.ts";
import {
  type Behavior,
  FakeMxc,
  healthyBox,
  type Leaks,
  nodeFolder,
  nodeProgram,
  testBoxes,
} from "./fake-mxc.test-helper.ts";
import { grantPath } from "./grant-path.ts";
import { MemoryDisk } from "./memory-disk.test-helper.ts";
import { MxcSandbox } from "./mxc-sandbox.ts";

// Made-up Windows paths, each marked for the leak guard on its own line.
const project = "C:\\acme\\project"; // leak-guard: allow absolute-path made-up Windows path for a test

/** The adapter and its canary on a fake SDK and a memory disk. */
function setup(leaks: Leaks | Behavior = {}) {
  const disk = new MemoryDisk().folder(project).folder(nodeFolder);
  const fake = new FakeMxc(disk, typeof leaks === "function" ? leaks : healthyBox(disk, leaks));
  const { boxes, made } = testBoxes(disk);
  const sandbox = new MxcSandbox(fake.machine(), boxes, { disk, nodeProgram });
  const canary = new MxcCanary({
    projectFolder: project,
    bridgePort: 4100,
    boxes,
    disk,
    nodeProgram,
    programTimeoutMs: 50,
  });
  return { disk, fake, sandbox, canary, made };
}

verifies("sandbox-mxc.canary", () => {
  describe("MxcCanary.profile", () => {
    it("builds the box like a real session: the project folder and a fresh box folder, never %TEMP%, with the bridge", async () => {
      const { canary, made } = setup();
      const profile = await canary.profile();
      const [box] = made();
      expect(profile).toMatchObject({
        workingFolder: project,
        env: {},
        network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
        timeLimitMs: 60_000,
      });
      const inBox = [
        profile.tempFolder,
        profile.settingsFolder,
        profile.readOnlyPaths[0],
        ...profile.deniedPaths,
      ];
      for (const path of inBox) expect(grantPath(path ?? "")).toContain(grantPath(box ?? ""));
      expect(profile.readOnlyPaths).toContain(nodeFolder);
      expect(JSON.stringify(profile).toLowerCase()).not.toContain("temp\\halonic");
    });

    it("makes a new box folder each time, and removes the one before", async () => {
      const { canary, made, disk } = setup();
      await canary.profile();
      await canary.profile();
      const [first, second] = made();
      expect(first).not.toBe(second);
      const names = disk.fileNames();
      expect(names.some((name) => name.includes("box-4242-1"))).toBe(false);
      expect(names.some((name) => name.includes("box-4242-2"))).toBe(true);
      await canary.release();
      expect(disk.fileNames().filter((name) => name.includes("mxc-boxes"))).toEqual([]);
    });
  });

  describe("the trust check on the canary", () => {
    it("passes in a box that is fenced and not too strict, and says name lookups leave", async () => {
      const { sandbox, canary } = setup();
      expect(await runTrustCheck(sandbox, canary)).toEqual({
        passed: true,
        nameLookupsLeave: true,
      });
    });

    it.each<[string, Leaks, string]>([
      ["a hidden file is readable", { hidden: true }, "file-readable"],
      ["a denied file inside a readable folder is readable", { denied: true }, "file-readable"],
      ["a file is written where nothing may be written", { writeOutside: true }, "file-writable"],
      ["a loopback port is reached", { reachPort: true }, "port-reachable"],
      ["the router or the local network is reached", { reachLan: true }, "port-reachable"],
      ["an address on the internet is reached", { reachInternet: true }, "internet-reachable"],
      ["a public DNS server answers", { reachDns: true }, "dns-reachable"],
      [
        "every network probe fails with an error that is no refusal",
        { networkFailsWith: "UNKNOWN" },
        "too-strict",
      ],
      [
        "blocked probes time out and the bridge can't be reached",
        { blockedAttemptsTimeOut: true, bridgeUnreachable: true },
        "too-strict",
      ],
      ["the read-only file can't be read", { controlUnreadable: true }, "too-strict"],
      ["Node can't list or write the working folder", { workFolderBroken: true }, "too-strict"],
    ])("fails as %s when %s", async (_what, leaks, code) => {
      const { sandbox, canary } = setup(leaks);
      expect(await runTrustCheck(sandbox, canary)).toMatchObject({ passed: false, reason: code });
    });

    it("counts a timeout as blocked when the bridge, the network control, was reached", async () => {
      const { sandbox, canary } = setup({ blockedAttemptsTimeOut: true });
      expect(await runTrustCheck(sandbox, canary)).toEqual({
        passed: true,
        nameLookupsLeave: true,
      });
    });

    it("fails as did-not-start when the probe program prints nothing", async () => {
      const { sandbox, canary } = setup(() => ({ exitCode: 1, stderr: "Error: no node\n" }));
      const result = await runTrustCheck(sandbox, canary);
      expect(result).toMatchObject({ passed: false, reason: "did-not-start" });
      expect(JSON.stringify(result)).toContain("no node");
    });

    it("fails as other when the probe runs out of time, and the program is killed", async () => {
      const { sandbox, canary, fake } = setup();
      let probes = 0;
      fake.behave((call) => {
        probes += 1;
        // The proof and the first canary probe answer; the work probe hangs.
        return probes < 3 ? healthyBox(new MemoryDisk(), {})(call) : { hang: true };
      });
      const result = await runTrustCheck(sandbox, canary);
      expect(result).toMatchObject({ passed: false, reason: "other" });
      expect(fake.killed).toBeGreaterThan(0);
    });

    it("removes the work script from the project folder, and the canary's box folder, when it is done", async () => {
      const { sandbox, canary, disk } = setup();
      await runTrustCheck(sandbox, canary);
      expect(disk.fileNames().filter((name) => name.includes(".halonic-canary"))).toEqual([]);
      expect(disk.fileNames().filter((name) => name.includes("mxc-boxes"))).toEqual([]);
    });

    it("refuses a probe before a profile", async () => {
      const { sandbox, canary } = setup();
      const session = await sandbox.open(await canary.profile());
      await canary.release();
      await expect(canary.probe(session)).rejects.toThrow("profile()");
      await session.close();
    });
  });
});
