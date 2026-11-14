import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { mxcSdkPinsFor, type PinnedPackage } from "./sdk-pins.ts";
import { readTarball } from "./tar-reader.ts";

/** Fetches the bytes at `url`, following no redirect. It throws when the computer is offline or the answer isn't a success. */
export type FetchBytes = (url: string) => Promise<Buffer>;

/** What {@link installMxcSdk} did. */
export type SdkInstall =
  | {
      installed: true;
      /** The folder that holds `node_modules/@microsoft/mxc-sdk` and the packages it needs. */
      folder: string;
      /** `false` when the verified files were already there and nothing was fetched. */
      downloaded: boolean;
    }
  | {
      installed: false;
      /**
       * `offline`: no good answer from the registry (no network, or it answered 404 or 5xx), so trying again later may work; `problem` says which.
       * `rejected`: we got bytes, but they are not the pinned ones or not safe to unpack.
       * `failed`: the files couldn't be written, such as a full disk or no permission.
       */
      reason: "offline" | "rejected" | "failed";
      problem: string;
    };

export interface SdkInstallOptions {
  /** The folder all SDK installs live in, inside the user's Halonic data folder. */
  root: string;
  /** Replaces the real registry fetch in tests. */
  fetchBytes?: FetchBytes;
  /** Replaces the pins for this processor ({@link mxcSdkPinsFor}) in tests. */
  pins?: readonly PinnedPackage[];
}

const markerName = ".verified";
const leftoverMark = ".installing-";

interface UnpackedFile {
  path: string;
  content: Buffer;
}
const registryHost = "registry.npmjs.org";

/**
 * Makes sure MXC's SDK is on the disk, verified, and says where. Nothing is
 * fetched when the verified files are already there. Otherwise every pinned
 * tarball is fetched and its SHA-512 checked before any byte is unpacked; the
 * files go into a temporary folder next to the target, the folder is renamed
 * into place in one step, and the `.verified` marker is written last, so a
 * half-finished install never counts as installed. It never throws: a disk
 * that can't be written gives `failed`.
 */
export async function installMxcSdk(options: SdkInstallOptions): Promise<SdkInstall> {
  const pins = options.pins ?? mxcSdkPinsFor(process.arch);
  const folder = installFolder(options.root, pins);
  if (await isVerified(folder, pins)) return { installed: true, folder, downloaded: false };

  const tarballs = await fetchVerified(pins, options.fetchBytes ?? fetchFromRegistry);
  if (!Array.isArray(tarballs)) return tarballs;

  const unpacked = await unpackAll(pins, tarballs);
  if ("installed" in unpacked) return unpacked;

  try {
    await removeLeftovers(options.root);
    // Another install may have finished while this one downloaded: never remove a finished folder.
    if (await isVerified(folder, pins)) return { installed: true, folder, downloaded: false };
    await rm(folder, { recursive: true, force: true });
    await writeFolder(folder, unpacked.files);
    await writeFile(join(folder, markerName), markerText(pins));
  } catch (error) {
    return { installed: false, reason: "failed", problem: describe(error) };
  }
  return { installed: true, folder, downloaded: true };
}

/** Writes `files` into a temporary folder next to `folder` and renames it into place in one step. */
async function writeFolder(folder: string, files: readonly UnpackedFile[]): Promise<void> {
  const temp = `${folder}${leftoverMark}${randomBytes(6).toString("hex")}`;
  try {
    for (const file of files) {
      const target = join(temp, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }
    await rename(temp, folder);
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
}

/** Removes the temporary folders an install that was cut short left behind. */
async function removeLeftovers(root: string): Promise<void> {
  const names = await readdir(root).catch(() => []);
  for (const name of names) {
    if (name.includes(leftoverMark))
      await rm(join(root, basename(name)), { recursive: true, force: true });
  }
}

/** Where the install of exactly these pins lives. A new pin gets a new folder. */
export function installFolder(
  root: string,
  pins: readonly PinnedPackage[] = mxcSdkPinsFor(process.arch),
): string {
  const id = createHash("sha256").update(markerText(pins)).digest("hex").slice(0, 12);
  return join(root, `mxc-sdk-${id}`);
}

/** Whether the folder holds a finished install of exactly these pins. */
export async function isVerified(folder: string, pins: readonly PinnedPackage[]): Promise<boolean> {
  try {
    return (await readFile(join(folder, markerName), "utf8")) === markerText(pins);
  } catch {
    return false;
  }
}

function markerText(pins: readonly PinnedPackage[]): string {
  return pins.map((pin) => `${pin.name}@${pin.version} ${pin.integrity}`).join("\n");
}

/** Every pinned tarball's bytes, checked against its integrity; or why not. */
async function fetchVerified(
  pins: readonly PinnedPackage[],
  fetchBytes: FetchBytes,
): Promise<Buffer[] | Extract<SdkInstall, { installed: false }>> {
  const tarballs: Buffer[] = [];
  for (const pin of pins) {
    if (!isRegistryUrl(pin.tarballUrl)) {
      return rejected(`${pin.name}: the pinned address is not https on ${registryHost}`);
    }
    let bytes: Buffer;
    try {
      bytes = await fetchBytes(pin.tarballUrl);
    } catch (error) {
      return { installed: false, reason: "offline", problem: `${pin.name}: ${describe(error)}` };
    }
    if (integrityOf(bytes) !== pin.integrity) {
      return rejected(`${pin.name}@${pin.version}: the download does not match its pinned hash`);
    }
    tarballs.push(bytes);
  }
  return tarballs;
}

/** The files of every tarball, placed under `node_modules/<package name>/`; or why not. */
async function unpackAll(
  pins: readonly PinnedPackage[],
  tarballs: readonly Buffer[],
): Promise<{ files: UnpackedFile[] } | Extract<SdkInstall, { installed: false }>> {
  const files: UnpackedFile[] = [];
  for (const [index, pin] of pins.entries()) {
    try {
      for (const file of readTarball(tarballs[index] as Buffer)) {
        const inside = file.path.split("/").slice(1).join("/");
        if (inside)
          files.push({ path: `node_modules/${pin.name}/${inside}`, content: file.content });
      }
    } catch (error) {
      return rejected(`${pin.name}@${pin.version}: ${describe(error)}`);
    }
  }
  return { files };
}

function rejected(problem: string): Extract<SdkInstall, { installed: false }> {
  return { installed: false, reason: "rejected", problem };
}

function integrityOf(bytes: Buffer): string {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

function isRegistryUrl(url: string): boolean {
  const parsed = new URL(url);
  return parsed.protocol === "https:" && parsed.hostname === registryHost;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The real fetch: https on the registry only, no redirect, the whole body or a throw. */
const fetchFromRegistry: FetchBytes = async (url) => {
  if (!isRegistryUrl(url)) throw new Error(`refusing to fetch ${url}`);
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok)
    throw new Error(
      `the registry answered ${response.status}${response.status === 404 ? " (the pinned file is not published)" : ""}`,
    );
  return Buffer.from(await response.arrayBuffer());
};
