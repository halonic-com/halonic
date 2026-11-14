import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import type { ImportMxcSdk } from "./machine.ts";
import { type SdkPackage, sdkPackagesFor } from "./sdk-packages.ts";
import { readTarFiles } from "./tar.ts";

/** The folder under Halonic's data folder that holds the downloaded SDK. */
export const sdkFolderName = "mxc-sdk";

/** The registry the tarballs come from. */
const registry = "https://registry.npmjs.org";

/** What the download asks of the network: the built-in `fetch`, or a fake in a test. */
export type Fetch = (url: string) => Promise<Pick<Response, "ok" | "status" | "arrayBuffer">>;

/**
 * Where the SDK is kept: `<dataFolder>\mxc-sdk`, laid out like a
 * `node_modules` folder so Node finds `koffi` and `semver` next to the SDK.
 *
 * @param dataFolder - Halonic's data folder, `%LOCALAPPDATA%\halonic` unless `HALONIC_HOME` moves it
 */
export function sdkFolderOf(dataFolder: string): string {
  return join(dataFolder, sdkFolderName);
}

/** The file Node imports for `@microsoft/mxc-sdk/v1`, inside `sdkFolder`. */
export function sdkEntryOf(sdkFolder: string): string {
  return join(sdkFolder, "node_modules", "@microsoft", "mxc-sdk", "dist", "v1", "index.js");
}

/** What a finished download writes last: the list it holds, so a changed pin downloads again. */
function markerOf(sdkFolder: string): string {
  return join(sdkFolder, "installed.json");
}

function listOf(packages: readonly SdkPackage[]): string {
  return JSON.stringify(
    packages.map(({ name, version, integrity }) => ({ name, version, integrity })),
  );
}

/** Whether `sdkFolder` holds a finished download of exactly `packages`. */
export async function isSdkDownloaded(
  sdkFolder: string,
  packages: readonly SdkPackage[] = sdkPackagesFor(process.arch),
): Promise<boolean> {
  try {
    return (await readFile(markerOf(sdkFolder), "utf8")) === listOf(packages);
  } catch {
    return false;
  }
}

/**
 * Downloads MXC's SDK and what it needs into `sdkFolder`, unless that is
 * already done. Each tarball is checked against its pinned integrity before
 * anything is unpacked, and a mismatch refuses the whole download. The
 * packages are unpacked into a new folder that replaces `sdkFolder` only when
 * all of them are in, so a broken download never leaves a half-installed SDK
 * for the loader to find.
 *
 * @param sdkFolder - where the SDK goes, see {@link sdkFolderOf}
 * @param fetchTarball - how to fetch a URL; the default is the built-in `fetch`
 * @param packages - what to download; the default is {@link sdkPackagesFor} for this processor
 * @throws when a download fails or doesn't match its integrity
 */
export async function downloadMxcSdk(
  sdkFolder: string,
  fetchTarball: Fetch = (url) => fetch(url),
  packages: readonly SdkPackage[] = sdkPackagesFor(process.arch),
): Promise<void> {
  if (await isSdkDownloaded(sdkFolder, packages)) return;
  // Each download unpacks into a folder of its own, so two at once never mix their files.
  await mkdir(dirname(sdkFolder), { recursive: true });
  const building = await mkdtemp(`${sdkFolder}.downloading-`);
  try {
    for (const sdkPackage of packages) {
      const tarball = await tarballOf(sdkPackage, fetchTarball);
      await unpack(tarball, join(building, "node_modules", ...sdkPackage.name.split("/")));
    }
    await writeFile(markerOf(building), listOf(packages));
    await rm(sdkFolder, { recursive: true, force: true });
    await rename(building, sdkFolder);
  } catch (error) {
    // A download that finished first has already filled `sdkFolder`; that is as good as ours.
    if (await isSdkDownloaded(sdkFolder, packages)) return;
    throw error;
  } finally {
    await rm(building, { recursive: true, force: true });
  }
}

/** The tarball of `sdkPackage`, checked against its integrity. */
async function tarballOf(sdkPackage: SdkPackage, fetchTarball: Fetch): Promise<Buffer> {
  const { name, version, integrity } = sdkPackage;
  const base = name.slice(name.lastIndexOf("/") + 1);
  const response = await fetchTarball(`${registry}/${name}/-/${base}-${version}.tgz`);
  if (!response.ok)
    throw new Error(`${name}@${version} can't be downloaded (HTTP ${response.status})`);
  const tarball = Buffer.from(await response.arrayBuffer());
  const expected = Buffer.from(integrity.replace(/^sha512-/, ""), "base64");
  const actual = createHash("sha512").update(tarball).digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error(`${name}@${version} doesn't match its pinned integrity, so it is refused`);
  }
  return tarball;
}

/** Writes the files of `tarball` under `folder`, dropping npm's leading `package/` folder. */
async function unpack(tarball: Buffer, folder: string): Promise<void> {
  const root = resolve(folder);
  for (const file of readTarFiles(gunzipSync(tarball))) {
    const inside = file.path.replace(/^package\//, "");
    const target = resolve(root, inside);
    if (!target.startsWith(root + sep)) {
      throw new Error(`the package holds a file outside its folder: ${file.path}`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
}

/**
 * Imports the downloaded SDK from `sdkFolder`, for {@link mxcSdkLoader}.
 *
 * @param packages - what the download must hold; the default is {@link sdkPackagesFor} for this processor
 *
 * @throws when the download isn't there or isn't finished, with a sentence that says so
 */
export function importDownloadedSdk(
  sdkFolder: string,
  packages: readonly SdkPackage[] = sdkPackagesFor(process.arch),
): ImportMxcSdk {
  return async () => {
    if (!(await isSdkDownloaded(sdkFolder, packages))) {
      throw new Error("MXC's SDK needs to be downloaded first");
    }
    // HAL-188: never load a file from a skill's scripts folder.
    if (sdkFolder.split(/[\\/]/).includes("scripts")) {
      throw new Error("MXC's SDK can't be loaded from a scripts folder");
    }
    return import(pathToFileURL(sdkEntryOf(sdkFolder)).href);
  };
}
