import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { testBoxes } from "./fake-mxc.test-helper.ts";
import { type ImportMxcSdk, type MxcMachine, mxcSdkLoader, systemMachine } from "./machine.ts";
import { MemoryDisk } from "./memory-disk.test-helper.ts";
import { MxcSandbox } from "./mxc-sandbox.ts";

/** The adapter on `machine`, with box folders on a memory disk. */
function sandboxOn(machine: MxcMachine): MxcSandbox {
  return new MxcSandbox(machine, testBoxes(new MemoryDisk()).boxes);
}

/** An import of the SDK's module that counts how often it runs. */
function countingImport(load: () => Promise<unknown>): ImportMxcSdk & { count: () => number } {
  let count = 0;
  const importSdk = async () => {
    count += 1;
    return load();
  };
  return Object.assign(importSdk, { count: () => count });
}

/** What Node throws when a package isn't installed. */
const missing = () =>
  Promise.reject(new Error("Cannot find package '@microsoft/mxc-sdk' imported from machine.ts"));

/** A module like the SDK's that offers MXC, and records any call to its telemetry consent. */
function sdkModule(): Record<string, unknown> & { consentAsked: () => boolean } {
  let consentAsked = false;
  return {
    getPlatformSupport: () => ({ isSupported: true, isolationTier: "base-container" }),
    getAvailableBackends: () => [
      {
        backend: "processcontainer",
        tier: "base-container",
        capabilities: ["identitylessLoopbackProxy"],
      },
    ],
    spawn: async () => {
      throw new Error("not started in this test");
    },
    requestTelemetryConsent: () => {
      consentAsked = true;
    },
    consentAsked: () => consentAsked,
  };
}

/** Windows 11 Pro whose SDK comes through the real loader, with `importSdk` or its default. */
function windows11(importSdk?: ImportMxcSdk): MxcMachine {
  return {
    ...systemMachine(mxcSdkLoader("win32", importSdk)),
    platform: "win32",
    windowsRelease: () => ({ build: 26200, productName: "Windows 10 Pro" }),
  };
}

const profile: SandboxProfile = {
  workingFolder: "C:\\acme\\work", // leak-guard: allow absolute-path made-up Windows path for a test
  tempFolder: "C:\\acme\\temp", // leak-guard: allow absolute-path made-up Windows path for a test
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 1000,
};

verifies("sandbox-mxc.sdk-loading", () => {
  describe("not Windows", () => {
    it.each(["linux", "darwin"] as const)("refuses on %s without importing the SDK", async (os) => {
      const importSdk = countingImport(async () => sdkModule());
      expect(await systemMachine(mxcSdkLoader(os, importSdk)).mxcSupport()).toEqual({
        loaded: false,
        problem: `MXC's SDK can't be loaded or asked: it runs only on Windows, and this is ${os}`,
      });
      expect(importSdk.count()).toBe(0);
    });

    it("can't start MXC, and opens no session", async () => {
      const importSdk = countingImport(async () => sdkModule());
      const mxc = sandboxOn({
        ...systemMachine(mxcSdkLoader("linux", importSdk)),
        platform: "linux",
      });
      expect(await mxc.offered()).toBe(false);
      expect(await mxc.check()).toMatchObject({ ok: false, reason: "windows" });
      await expect(mxc.open(profile)).rejects.toThrow("MXC can't start here");
      expect(importSdk.count()).toBe(0);
    });
  });

  describe("SDK missing on Windows 11", () => {
    it("says other, with the import's error, and opens no session", async () => {
      const mxc = sandboxOn(windows11(missing));
      expect(await mxc.check()).toEqual({
        ok: false,
        reason: "other",
        missing: [
          "MXC's SDK can't be loaded or asked: Cannot find package '@microsoft/mxc-sdk' imported from machine.ts",
        ],
      });
      await expect(mxc.open(profile)).rejects.toThrow("MXC can't start here");
    });

    it("says other until this build declares the SDK", async () => {
      expect(await sandboxOn(windows11()).check()).toMatchObject({
        ok: false,
        reason: "other",
        missing: [
          "MXC's SDK can't be loaded or asked: this build of Halonic doesn't include it yet",
        ],
      });
    });

    it.each([
      ["a module without the calls", { getPlatformSupport: () => ({ isSupported: true }) }],
      [
        "a module without spawn",
        { getPlatformSupport: () => ({ isSupported: true }), getAvailableBackends: () => [] },
      ],
      ["no module", undefined],
    ])("says other for %s", async (_name, module) => {
      expect(await sandboxOn(windows11(async () => module)).check()).toEqual({
        ok: false,
        reason: "other",
        missing: [
          "MXC's SDK can't be loaded or asked: its module has no getPlatformSupport(), getAvailableBackends() and spawn()",
        ],
      });
    });

    it("tries the import only once per process", async () => {
      const importSdk = countingImport(missing);
      const mxc = sandboxOn(windows11(importSdk));
      await mxc.offered();
      await mxc.check();
      await mxc.check();
      expect(importSdk.count()).toBe(1);
    });
  });

  describe("SDK installed on Windows 11", () => {
    it("imports it once, on first use, and never asks for telemetry consent", async () => {
      const module = sdkModule();
      const importSdk = countingImport(async () => module);
      const mxc = sandboxOn(windows11(importSdk));
      expect(importSdk.count()).toBe(0);
      expect(await mxc.offered()).toBe(true);
      expect(await mxc.check()).toEqual({ ok: true, reason: null, missing: [] });
      expect(importSdk.count()).toBe(1);
      expect(module.consentAsked()).toBe(false);
    });

    it("hands the adapter only the three calls it uses", async () => {
      const sdk = await mxcSdkLoader("win32", async () => sdkModule())();
      expect(Object.keys(sdk).sort()).toEqual([
        "getAvailableBackends",
        "getPlatformSupport",
        "spawn",
      ]);
    });
  });
});
