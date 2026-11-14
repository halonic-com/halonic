import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  downloadMxcSdk,
  type Fetch,
  importDownloadedSdk,
  isSdkDownloaded,
} from "./sdk-download.ts";
import { type SdkPackage, sdkPackagesFor } from "./sdk-packages.ts";
import { readTarFiles } from "./tar.ts";

/** A tar archive of `files`, written the way `npm pack` does, with a `package/` folder. */
function tarOf(files: Record<string, string>, type = "0"): Buffer {
  const blocks: Buffer[] = [];
  for (const [path, text] of Object.entries(files)) {
    const header = Buffer.alloc(512);
    header.write(path, 0, "utf8");
    header.write(`${Buffer.byteLength(text).toString(8).padStart(11, "0")}\0`, 124, "ascii");
    header.write(type, 156, "ascii");
    blocks.push(
      header,
      Buffer.from(text.padEnd(Math.ceil(Buffer.byteLength(text) / 512) * 512, "\0")),
    );
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

/** A package for the download, with its tarball and the integrity that matches it. */
function packageOf(name: string, files: Record<string, string>) {
  const tarball = gzipSync(tarOf(files));
  const integrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
  const sdkPackage: SdkPackage = { name, version: "1.0.0", integrity };
  return { sdkPackage, tarball };
}

/** A registry that serves `tarballs` by URL, and counts what it was asked. */
function registryOf(tarballs: Record<string, Buffer>): Fetch & { count: () => number } {
  let count = 0;
  const fetchTarball: Fetch = async (url) => {
    count += 1;
    const tarball = tarballs[url];
    return {
      ok: tarball !== undefined,
      status: tarball === undefined ? 404 : 200,
      arrayBuffer: async () => new Uint8Array(tarball ?? []).buffer,
    };
  };
  return Object.assign(fetchTarball, { count: () => count });
}

const sdk = packageOf("@acme/sdk", { "package/dist/v1/index.js": "export const spawn = 1;" });
const helper = packageOf("helper", { "package/index.js": "module.exports = 1;" });
const packages = [sdk.sdkPackage, helper.sdkPackage];
const registry = () =>
  registryOf({
    "https://registry.npmjs.org/@acme/sdk/-/sdk-1.0.0.tgz": sdk.tarball,
    "https://registry.npmjs.org/helper/-/helper-1.0.0.tgz": helper.tarball,
  });

let dataFolder: string;
let sdkFolder: string;
beforeEach(async () => {
  dataFolder = await mkdtemp(join(tmpdir(), "mxc-sdk-test-"));
  sdkFolder = join(dataFolder, "mxc-sdk");
});
afterEach(() => rm(dataFolder, { recursive: true, force: true }));

verifies("sandbox-mxc.sdk-download", () => {
  it("unpacks every package under node_modules, and downloads nothing the second time", async () => {
    const fetchTarball = registry();
    await downloadMxcSdk(sdkFolder, fetchTarball, packages);
    expect(await readFile(join(sdkFolder, "node_modules/@acme/sdk/dist/v1/index.js"), "utf8")).toBe(
      "export const spawn = 1;",
    );
    expect(await readFile(join(sdkFolder, "node_modules/helper/index.js"), "utf8")).toBe(
      "module.exports = 1;",
    );
    expect(await isSdkDownloaded(sdkFolder, packages)).toBe(true);

    await downloadMxcSdk(sdkFolder, fetchTarball, packages);
    expect(fetchTarball.count()).toBe(2);
  });

  it("keeps two downloads at once apart, leaving one complete SDK", async () => {
    await Promise.all([
      downloadMxcSdk(sdkFolder, registry(), packages),
      downloadMxcSdk(sdkFolder, registry(), packages),
    ]);
    expect(await isSdkDownloaded(sdkFolder, packages)).toBe(true);
    expect(await readdir(dataFolder)).toEqual(["mxc-sdk"]);
    expect(await readFile(join(sdkFolder, "node_modules/helper/index.js"), "utf8")).toBe(
      "module.exports = 1;",
    );
  });

  it("downloads again when a pin changed", async () => {
    await downloadMxcSdk(sdkFolder, registry(), packages);
    expect(await isSdkDownloaded(sdkFolder, [sdk.sdkPackage])).toBe(false);
  });

  it("refuses a tarball that doesn't match its integrity and leaves no folder", async () => {
    const fetchTarball = registryOf({
      "https://registry.npmjs.org/@acme/sdk/-/sdk-1.0.0.tgz": sdk.tarball,
      "https://registry.npmjs.org/helper/-/helper-1.0.0.tgz": gzipSync(
        tarOf({ "package/index.js": "evil" }),
      ),
    });
    await expect(downloadMxcSdk(sdkFolder, fetchTarball, packages)).rejects.toThrow(
      "helper@1.0.0 doesn't match its pinned integrity",
    );
    expect(existsSync(sdkFolder)).toBe(false);
    expect(await readdir(dataFolder)).toEqual([]);
  });

  it("fails without touching an earlier download when the network is down", async () => {
    await downloadMxcSdk(sdkFolder, registry(), packages);
    const newer = [{ ...sdk.sdkPackage, version: "1.0.1" }, helper.sdkPackage];
    await expect(downloadMxcSdk(sdkFolder, registryOf({}), newer)).rejects.toThrow("HTTP 404");
    expect(await isSdkDownloaded(sdkFolder, packages)).toBe(true);
  });

  it("refuses an archive with a file outside its package folder", async () => {
    const escaping = packageOf("escape", { "package/../../outside.js": "x" });
    const fetchTarball = registryOf({
      "https://registry.npmjs.org/escape/-/escape-1.0.0.tgz": escaping.tarball,
    });
    await expect(downloadMxcSdk(sdkFolder, fetchTarball, [escaping.sdkPackage])).rejects.toThrow(
      "outside its folder",
    );
    expect(existsSync(join(dataFolder, "outside.js"))).toBe(false);
  });

  it("refuses to import an SDK that was never downloaded", async () => {
    await expect(importDownloadedSdk(sdkFolder)()).rejects.toThrow("needs to be downloaded first");
  });

  it("never imports from a skill's scripts folder (HAL-188)", async () => {
    const inScripts = join(dataFolder, "skills", "acme", "scripts", "mxc-sdk");
    await downloadMxcSdk(inScripts, registry(), packages);
    await expect(importDownloadedSdk(inScripts, packages)()).rejects.toThrow("scripts folder");
  });

  it("imports the SDK's module from the download", async () => {
    const entry = packageOf("@microsoft/mxc-sdk", {
      "package/dist/v1/index.js": "export const answer = 42;",
    });
    await downloadMxcSdk(
      sdkFolder,
      registryOf({
        "https://registry.npmjs.org/@microsoft/mxc-sdk/-/mxc-sdk-1.0.0.tgz": entry.tarball,
      }),
      [entry.sdkPackage],
    );
    expect(await importDownloadedSdk(sdkFolder, [entry.sdkPackage])()).toMatchObject({
      answer: 42,
    });
  });
});

describe("sdkPackagesFor", () => {
  it.each(["x64", "arm64"])(
    "holds the SDK, koffi, semver and koffi's compiled part for %s",
    (arch) => {
      expect(sdkPackagesFor(arch).map((sdkPackage) => sdkPackage.name)).toEqual([
        "@microsoft/mxc-sdk",
        "koffi",
        "semver",
        `@koromix/koffi-win32-${arch}`,
      ]);
    },
  );

  it("pins every package to one exact version", () => {
    for (const sdkPackage of [...sdkPackagesFor("x64"), ...sdkPackagesFor("arm64")]) {
      expect(sdkPackage.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});

describe("readTarFiles", () => {
  it("reads regular files and skips links and folders", () => {
    const files = readTarFiles(
      Buffer.concat([tarOf({ "a.txt": "A" }).subarray(0, 1024), tarOf({ link: "" }, "2")]),
    );
    expect(files.map((file) => file.path)).toEqual(["a.txt"]);
  });

  it("refuses an archive that is cut short", () => {
    expect(() => readTarFiles(tarOf({ "a.txt": "A" }).subarray(0, 512))).toThrow("cut short");
  });

  it("reads a long path from a pax header", () => {
    const long = `package/${"deep/".repeat(30)}file.js`;
    const record = ` path=${long}\n`;
    const pax = `${String(record.length + String(record.length + 2).length)}${record}`;
    const archive = Buffer.concat([
      tarOf({ PaxHeader: pax }, "x").subarray(0, 1024),
      tarOf({ "package/truncated": "ok" }),
    ]);
    expect(readTarFiles(archive).map((file) => file.path)).toEqual([long]);
  });
});
