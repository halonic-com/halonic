import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fakeRegistry, pinFor, tarball } from "./fake-registry.test-helper.ts";
import { installMxcSdk } from "./sdk-install.ts";
import { mxcSdkPins, mxcSdkPinsFor, type PinnedPackage } from "./sdk-pins.ts";

const sdkBytes = tarball([
  ["package/package.json", '{"name":"@microsoft/mxc-sdk"}'],
  ["package/dist/v1/index.js", "export {}"],
]);
const koffiBytes = tarball([["package/index.js", "module.exports = {}"]]);
const pins = [pinFor("@microsoft/mxc-sdk", sdkBytes), pinFor("koffi", koffiBytes)];

const answers = () => ({
  [pins[0]?.tarballUrl as string]: sdkBytes,
  [pins[1]?.tarballUrl as string]: koffiBytes,
});

verifies("sandbox-mxc.sdk-install", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mxc-install-"));
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it("pins the SDK, koffi with its Windows builds and semver, all https on the npm registry, without node-pty", () => {
    expect(mxcSdkPins.map((pin) => pin.name)).toEqual([
      "@microsoft/mxc-sdk",
      "koffi",
      "semver",
      "@koromix/koffi-win32-x64",
      "@koromix/koffi-win32-arm64",
    ]);
    for (const pin of mxcSdkPins) {
      expect(pin.tarballUrl.startsWith("https://registry.npmjs.org/")).toBe(true);
      expect(pin.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);
    }
  });

  it("downloads the first time and nothing the second time", async () => {
    const registry = fakeRegistry(answers());
    const first = await installMxcSdk({ root, pins, fetchBytes: registry.fetchBytes });
    expect(first).toMatchObject({ installed: true, downloaded: true });
    if (!first.installed) return;
    expect(
      await readFile(
        join(first.folder, "node_modules/@microsoft/mxc-sdk/dist/v1/index.js"),
        "utf8",
      ),
    ).toBe("export {}");
    expect(await readFile(join(first.folder, "node_modules/koffi/index.js"), "utf8")).toBe(
      "module.exports = {}",
    );

    const second = await installMxcSdk({ root, pins, fetchBytes: registry.fetchBytes });
    expect(second).toEqual({ installed: true, folder: first.folder, downloaded: false });
    expect(registry.calls).toHaveLength(2);
  });

  it("rejects a download whose hash differs and leaves nothing on the disk", async () => {
    const registry = fakeRegistry({
      ...answers(),
      [pins[1]?.tarballUrl as string]: tarball([["package/evil.js", "x"]]),
    });
    const result = await installMxcSdk({ root, pins, fetchBytes: registry.fetchBytes });
    expect(result).toMatchObject({ installed: false, reason: "rejected" });
    expect(await readdir(root)).toEqual([]);
  });

  it("rejects a download that is cut off", async () => {
    const cutOff = sdkBytes.subarray(0, sdkBytes.length - 20);
    const registry = fakeRegistry({ ...answers(), [pins[0]?.tarballUrl as string]: cutOff });
    const result = await installMxcSdk({ root, pins, fetchBytes: registry.fetchBytes });
    expect(result).toMatchObject({ installed: false, reason: "rejected" });
    expect(await readdir(root)).toEqual([]);
  });

  it("says offline when the registry can't be reached, and leaves nothing", async () => {
    const registry = fakeRegistry({ [pins[0]?.tarballUrl as string]: new Error("fetch failed") });
    const result = await installMxcSdk({ root, pins, fetchBytes: registry.fetchBytes });
    expect(result).toMatchObject({ installed: false, reason: "offline" });
    expect(await readdir(root)).toEqual([]);
  });

  it.each([
    ["climbs out with ..", "package/../../outside.js", "0"],
    ["has an absolute path", "/etc/outside.js", "0"],
    ["has a Windows drive path", "C:/outside.js", "0"], // leak-guard: allow absolute-path made-up Windows path for a test
    ["is a symbolic link", "package/link", "2"],
    ["is a hard link", "package/hard", "1"],
    ["names a Windows stream", "package/x.js:evil", "0"],
    ["names a Windows device", "package/CON", "0"],
    ["names a Windows device with an extension", "package/nul.txt", "0"],
    ["ends in a dot", "package/x.js.", "0"],
    ["ends in a space", "package/x.js ", "0"],
    ["has a control character", "package/x\u0001.js", "0"],
  ])(
    "rejects a tarball with an entry that %s, even with a matching hash",
    async (_what, path, type) => {
      const bad = tarball([
        ["package/ok.js", "ok"],
        [path, "x", type],
      ]);
      const badPins = [pinFor("koffi", bad)];
      const registry = fakeRegistry({ [badPins[0]?.tarballUrl as string]: bad });
      const result = await installMxcSdk({ root, pins: badPins, fetchBytes: registry.fetchBytes });
      expect(result).toMatchObject({ installed: false, reason: "rejected" });
      expect(await readdir(root)).toEqual([]);
      expect(existsSync(join(root, "..", "outside.js"))).toBe(false);
    },
  );

  it("never counts a folder without the marker as installed", async () => {
    const registry = fakeRegistry(answers());
    const first = await installMxcSdk({ root, pins, fetchBytes: registry.fetchBytes });
    if (!first.installed) throw new Error("expected an install");
    await rm(join(first.folder, ".verified"));
    const again = await installMxcSdk({ root, pins, fetchBytes: registry.fetchBytes });
    expect(again).toMatchObject({ installed: true, downloaded: true });
  });

  it("refuses a pinned address that is not https on the registry", async () => {
    const odd = [{ ...pins[0], tarballUrl: "http://registry.npmjs.org/x.tgz" } as PinnedPackage];
    const registry = fakeRegistry({});
    const result = await installMxcSdk({ root, pins: odd, fetchBytes: registry.fetchBytes });
    expect(result).toMatchObject({ installed: false, reason: "rejected" });
    expect(registry.calls).toEqual([]);
  });

  it("says failed, and leaves nothing, when the disk can't be written", async () => {
    const registry = fakeRegistry(answers());
    const blocked = join(root, "not-a-folder");
    await writeFile(blocked, "a file where the install folder should go");
    const result = await installMxcSdk({ root: blocked, pins, fetchBytes: registry.fetchBytes });
    expect(result).toMatchObject({ installed: false, reason: "failed" });
  });

  it("removes the folders a cut-short install left behind", async () => {
    await mkdir(join(root, "mxc-sdk-abc.installing-0123"), { recursive: true });
    const registry = fakeRegistry(answers());
    await installMxcSdk({ root, pins, fetchBytes: registry.fetchBytes });
    expect((await readdir(root)).filter((name) => name.includes(".installing-"))).toEqual([]);
  });

  it("names a missing pinned file in the problem, apart from no network", async () => {
    const registry = fakeRegistry({
      [pins[0]?.tarballUrl as string]: new Error(
        "the registry answered 404 (the pinned file is not published)",
      ),
    });
    const result = await installMxcSdk({ root, pins, fetchBytes: registry.fetchBytes });
    expect(result).toMatchObject({ installed: false, reason: "offline" });
  });

  it.each([
    ["x64", "@koromix/koffi-win32-x64"],
    ["arm64", "@koromix/koffi-win32-arm64"],
  ] as const)("downloads only the native koffi build for %s", (cpu, native) => {
    const names = mxcSdkPinsFor(cpu).map((pin) => pin.name);
    expect(names).toContain(native);
    expect(names.filter((name) => name.startsWith("@koromix/"))).toEqual([native]);
  });
});
