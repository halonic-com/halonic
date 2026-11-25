// The plugin package holds exactly four files, each under a fixed name, so no
// path from the workspace ever becomes a path in the archive (Liam's
// condition on HAL-17985). The four names live here and nowhere else.

import { bytesToHex, canonicalJson, encodeUtf8, type Sha256 } from "@halonicjs/std";
import type { PluginSnapshot } from "./snapshot.ts";
import { writeTar } from "./tar-write.ts";

/** The folder npm and Paperclip expect a package's files in. */
export const packageFolder = "package/";

/** Each part of a plugin package and its fixed file name inside {@link packageFolder}. */
export const pluginFileNames = {
  packageJson: "package.json",
  manifest: "manifest.js",
  worker: "worker.js",
  snapshot: "snapshot.json",
} as const;

/** The snapshot's path inside the archive: the only file a later build reads back. */
export const snapshotPath = `${packageFolder}${pluginFileNames.snapshot}`;

/** The four parts of a plugin package, and nothing else. */
export interface PluginFiles {
  /** The generated `package.json` text. */
  readonly packageJson: string;
  /** The generated `manifest.js` text. */
  readonly manifest: string;
  /** The prebuilt runtime, copied byte for byte. */
  readonly worker: Uint8Array;
  /** The snapshot, written as {@link snapshotText}. */
  readonly snapshot: PluginSnapshot;
}

/**
 * The snapshot as the archive holds it: canonical JSON (keys sorted) and a
 * line break at the end, so the same snapshot always gives the same bytes.
 *
 * @example
 * snapshotText({ tools: [{ name: "a", description: "b" }] });
 * // '{"tools":[{"description":"b","name":"a"}]}\n'
 */
export function snapshotText(snapshot: PluginSnapshot): string {
  return `${canonicalJson(snapshot)}\n`;
}

/**
 * Writes a plugin package as one uncompressed tar: the four fixed files
 * under `package/`, nothing else. The same files always give the same bytes.
 *
 * @param files - the four parts
 * @returns the archive's bytes
 * @throws {TypeError} when `files` holds any part other than the four
 */
export function buildPluginArchive(files: PluginFiles): Uint8Array {
  // The type allows only the four parts, but a caller can still pass more at
  // run time (a spread, a cast); an extra part is a bug, never a fifth file.
  const extra = Object.keys(files).filter((part) => !Object.hasOwn(pluginFileNames, part));
  if (extra.length > 0) {
    throw new TypeError(`A plugin package has four fixed files; not ${extra.join(", ")}.`);
  }
  return writeTar([
    { name: inPackage(pluginFileNames.packageJson), bytes: encodeUtf8(files.packageJson) },
    { name: inPackage(pluginFileNames.manifest), bytes: encodeUtf8(files.manifest) },
    { name: inPackage(pluginFileNames.worker), bytes: files.worker },
    { name: inPackage(pluginFileNames.snapshot), bytes: snapshotBytes(files.snapshot) },
  ]);
}

/**
 * The archive's sha-256 as 64 lowercase hex characters, as the release file
 * holds it. The core has no hash code of its own, so the caller passes one in
 * (the `Digest` port, which asks the platform's Web Crypto).
 */
export async function archiveSha256(archive: Uint8Array, digest: Sha256): Promise<string> {
  return bytesToHex(await digest.sha256(archive));
}

/**
 * The sha-256 of `package/snapshot.json` as the archive holds it, 64
 * lowercase hex characters. The plugin's pin settings ask for it, so the
 * release file carries it and nobody has to unpack the archive to find it.
 *
 * @param snapshot - the snapshot passed to {@link buildPluginArchive}
 * @param digest - hashes the bytes (the `Digest` port)
 */
export async function snapshotSha256(snapshot: PluginSnapshot, digest: Sha256): Promise<string> {
  return bytesToHex(await digest.sha256(snapshotBytes(snapshot)));
}

/** The snapshot's bytes in the archive. Both the archive and its sha-256 take them from here. */
function snapshotBytes(snapshot: PluginSnapshot): Uint8Array {
  return encodeUtf8(snapshotText(snapshot));
}

function inPackage(fileName: string): string {
  return `${packageFolder}${fileName}`;
}
