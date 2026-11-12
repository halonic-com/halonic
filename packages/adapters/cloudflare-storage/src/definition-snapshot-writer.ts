import {
  buildSnapshotManifest,
  defaultSnapshotPrefix,
  snapshotKeys,
} from "./definition-snapshot.ts";

/** The one R2 call the writer makes. */
export interface SnapshotWriteBucket {
  put(key: string, value: string | Uint8Array): Promise<unknown>;
}

/**
 * Uploads a workspace as a snapshot: the files, then the manifest, then
 * `current`, so a half-finished upload is never the one served. Private files
 * are left out. This is the write side `halonic deploy` uses; the Worker only
 * reads.
 *
 * @returns the version that `current` now names
 */
export async function writeDefinitionSnapshot(
  bucket: SnapshotWriteBucket,
  files: Readonly<Record<string, string>>,
  keyPrefix: string = defaultSnapshotPrefix,
): Promise<string> {
  const manifest = await buildSnapshotManifest(files);
  const keys = snapshotKeys(keyPrefix);
  for (const entry of manifest.files) {
    await bucket.put(keys.file(manifest.version, entry.path), files[entry.path] ?? "");
  }
  await bucket.put(keys.manifest(manifest.version), JSON.stringify(manifest));
  await bucket.put(keys.current, manifest.version);
  return manifest.version;
}
