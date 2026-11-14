import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { installMxcSdk } from "./sdk-install.ts";
import { mxcSdkPins, type PinnedPackage } from "./sdk-pins.ts";

/** One 512-byte ustar header and the padded content of an entry. */
function tarEntry(path: string, content: string, type = "0"): Buffer {
  const header = Buffer.alloc(512);
  header.write(path, 0, "utf8");
  header.write("0000644\0", 100);
  header.write(`${Buffer.byteLength(content).toString(8).padStart(11, "0")}\0`, 124);
  header.write(type, 156);
  header.write("ustar\0", 257);
  header.write("        ", 148);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  const body = Buffer.alloc(Math.ceil(Buffer.byteLength(content) / 512) * 512);
  body.write(content);
  return Buffer.concat([header, body]);
}

/** A gzipped tarball of `entries` (path and content), npm-style. */
function tarball(entries: Array<[string, string] | [string, string, string]>): Buffer {
  const parts = entries.map(([path, content, type]) => tarEntry(path, content, type));
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}

function integrityOf(bytes: Buffer): string {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

/** A pinned package whose tarball is `bytes`, with the real pin's name. */
function pinFor(name: string, bytes: Buffer): PinnedPackage {
  return {
    name,
    version: "1.0.0",
    tarballUrl: `https://registry.npmjs.org/${name}/-/x-1.0.0.tgz`,
    integrity: integrityOf(bytes),
  };
}

const sdkBytes = tarball([
  ["package/package.json", '{"name":"@microsoft/mxc-sdk"}'],
  ["package/dist/v1/index.js", "export {}"],
]);
const koffiBytes = tarball([["package/index.js", "module.exports = {}"]]);
const pins = [pinFor("@microsoft/mxc-sdk", sdkBytes), pinFor("koffi", koffiBytes)];

/** A fake registry that answers by address and counts its answers. */
function fakeRegistry(bytesByUrl: Record<string, Buffer | Error>) {
  const calls: string[] = [];
  const fetchBytes = async (url: string) => {
    calls.push(url);
    const answer = bytesByUrl[url];
    if (!answer) throw new Error("no such package");
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { fetchBytes, calls };
}

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

  it("pins three packages, all https on the npm registry, without node-pty", () => {
    expect(mxcSdkPins.map((pin) => pin.name)).toEqual(["@microsoft/mxc-sdk", "koffi", "semver"]);
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
});
