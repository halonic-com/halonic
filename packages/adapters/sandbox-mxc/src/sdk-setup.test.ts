import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testBoxes } from "./fake-mxc.test-helper.ts";
import { fakeRegistry, pinFor, tarball } from "./fake-registry.test-helper.ts";
import { type MxcMachine, mxcSdkLoader, systemMachine } from "./machine.ts";
import { MemoryDisk } from "./memory-disk.test-helper.ts";
import { MxcSandbox } from "./mxc-sandbox.ts";
import { installFolder } from "./sdk-install.ts";
import { mxcSdkSetup } from "./sdk-setup.ts";

/** An SDK module like the real one: the three calls the adapter reads. */
const sdkSource = `
export const getPlatformSupport = () => ({ isSupported: true, isolationTier: "base-container" });
export const getAvailableBackends = () => [
  { backend: "processcontainer", tier: "base-container", capabilities: ["identitylessLoopbackProxy"] },
];
export const spawn = async () => { throw new Error("not started in this test"); };
`;
const sdkBytes = tarball([
  ["package/package.json", '{"name":"@microsoft/mxc-sdk","type":"module"}'],
  ["package/dist/v1/index.js", sdkSource],
]);
const pins = [pinFor("@microsoft/mxc-sdk", sdkBytes)];
const answers = () => ({ [pins[0]?.tarballUrl as string]: sdkBytes });

verifies("sandbox-mxc.sdk-setup", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mxc-setup-"));
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  /** Windows 11 Pro on the real loader, importing from the download under `root`. */
  function windows11(fetchBytes: (url: string) => Promise<Buffer>) {
    const setup = mxcSdkSetup({ root, pins, fetchBytes });
    const machine: MxcMachine = {
      ...systemMachine(mxcSdkLoader("win32", setup.importSdk)),
      platform: "win32",
      windowsRelease: () => ({ build: 26200, productName: "Windows 10 Pro" }),
    };
    const boxes = testBoxes(new MemoryDisk()).boxes;
    return { setup, sandbox: new MxcSandbox(machine, boxes, { sdkSetup: setup }) };
  }

  describe("before the download", () => {
    it("is offered, reports other, needs a download and fetches nothing", async () => {
      const registry = fakeRegistry(answers());
      const { sandbox, setup } = windows11(registry.fetchBytes);
      expect(await sandbox.offered()).toBe(true);
      expect(await sandbox.check()).toMatchObject({ ok: false, reason: "other" });
      expect(await sandbox.downloadNeeded()).toBe(true);
      expect(await setup.isDownloaded()).toBe(false);
      await expect(sandbox.open({} as never)).rejects.toThrow("MXC can't start here");
      expect(registry.calls).toEqual([]);
    });
  });

  describe("download", () => {
    it("lets the next check load the SDK without a restart", async () => {
      const registry = fakeRegistry(answers());
      const { sandbox } = windows11(registry.fetchBytes);
      expect(await sandbox.check()).toMatchObject({ ok: false, reason: "other" });
      expect(await sandbox.download()).toEqual({ done: true });
      expect(await sandbox.check()).toEqual({ ok: true, reason: null, missing: [] });
      expect(await sandbox.downloadNeeded()).toBe(false);
    });

    it("fetches every package once for two calls at the same time", async () => {
      const registry = fakeRegistry(answers());
      const { sandbox } = windows11(registry.fetchBytes);
      const both = await Promise.all([sandbox.download(), sandbox.download()]);
      expect(both).toEqual([{ done: true }, { done: true }]);
      expect(registry.calls).toHaveLength(pins.length);
    });

    it("says done: false offline, and a download is still needed", async () => {
      const { sandbox } = windows11(fakeRegistry({}).fetchBytes);
      expect(await sandbox.download()).toMatchObject({ done: false });
      expect(await sandbox.downloadNeeded()).toBe(true);
      expect(await sandbox.check()).toMatchObject({ ok: false, reason: "other" });
    });

    it("never throws when the disk can't be written", async () => {
      const blocked = join(root, "a-file");
      await writeFile(blocked, "x");
      const setup = mxcSdkSetup({
        root: blocked,
        pins,
        fetchBytes: fakeRegistry(answers()).fetchBytes,
      });
      expect(await setup.download()).toMatchObject({ done: false });
      expect(await setup.isDownloaded()).toBe(false);
    });

    it("can be tried again after a failure", async () => {
      let online = false;
      const registry = fakeRegistry(answers());
      const { sandbox } = windows11(async (url) => {
        if (!online) throw new Error("fetch failed");
        return registry.fetchBytes(url);
      });
      expect(await sandbox.download()).toMatchObject({ done: false });
      online = true;
      expect(await sandbox.download()).toEqual({ done: true });
    });
  });

  describe("importing the downloaded SDK", () => {
    it("imports nothing when the marker is missing", async () => {
      const folder = installFolder(root, pins);
      const entry = join(folder, "node_modules", "@microsoft", "mxc-sdk", "dist", "v1");
      await mkdir(entry, { recursive: true });
      await writeFile(join(entry, "index.js"), "globalThis.mxcSdkWasImported = true;");
      const setup = mxcSdkSetup({ root, pins, fetchBytes: fakeRegistry({}).fetchBytes });
      await expect(setup.importSdk()).rejects.toThrow();
      expect(Reflect.has(globalThis, "mxcSdkWasImported")).toBe(false);
    });

    it("refuses a root inside a skill's scripts/ folder, written out", async () => {
      const scripts = join(root, "skills", "mail", "scripts");
      await mkdir(scripts, { recursive: true });
      const setup = mxcSdkSetup({
        root: scripts,
        pins,
        fetchBytes: fakeRegistry(answers()).fetchBytes,
      });
      expect(await setup.download()).toEqual({ done: true });
      await expect(setup.importSdk()).rejects.toThrow("scripts/ folder");
    });

    it("refuses a root that a symbolic link leads into a skill's scripts/ folder", async () => {
      const scripts = join(root, "skills", "mail", "scripts");
      await mkdir(scripts, { recursive: true });
      const link = join(root, "data");
      await symlink(scripts, link, "dir");
      const setup = mxcSdkSetup({
        root: link,
        pins,
        fetchBytes: fakeRegistry(answers()).fetchBytes,
      });
      expect(await setup.download()).toEqual({ done: true });
      await expect(setup.importSdk()).rejects.toThrow("scripts/ folder");
    });
  });

  describe("without a setup", () => {
    it("has nothing to download", async () => {
      const machine = systemMachine(mxcSdkLoader("win32"));
      const sandbox = new MxcSandbox(machine, testBoxes(new MemoryDisk()).boxes);
      expect(await sandbox.download()).toMatchObject({ done: false });
    });
  });
});
