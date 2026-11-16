import {
  buildSnapshotManifest,
  defaultSnapshotPrefix,
  snapshotKeys,
} from "./definition-snapshot.ts";
import { formatRoutineIndex, type IndexedRoutine, routineIndexPath } from "./webhook-routines.ts";

/** The one R2 call the writer makes. */
export interface SnapshotWriteBucket {
  put(key: string, value: string | Uint8Array): Promise<unknown>;
}

/**
 * Uploads a workspace as a snapshot: the files and the routine index the
 * Worker reads webhooks from, then the manifest, then `current`, so a
 * half-finished upload is never the one served. Private files are left out.
 * This is the low-level call: it trusts that `routines` are those of `files`.
 * A deploy calls `writeWorkspaceSnapshot` of
 * `@halonicjs/target-cloudflare-deploy`, which builds them from the files, so
 * the two never differ. The index holds only what the routine files hold, and
 * it is listed in the manifest with its hash like any file. This is the write
 * side `halonic deploy` uses; the Worker only reads.
 *
 * @returns the version that `current` now names
 * @throws RangeError for a path the port forbids, or a file at the index's own path
 */
export async function writeDefinitionSnapshot(
  bucket: SnapshotWriteBucket,
  files: Readonly<Record<string, string>>,
  routines: readonly IndexedRoutine[],
  keyPrefix: string = defaultSnapshotPrefix,
): Promise<string> {
  if (routineIndexPath in files) {
    throw new RangeError(`${routineIndexPath} is where the snapshot keeps its routine index.`);
  }
  const uploaded: Record<string, string> = {
    ...files,
    [routineIndexPath]: formatRoutineIndex(routines),
  };
  const manifest = await buildSnapshotManifest(uploaded);
  const keys = snapshotKeys(keyPrefix);
  for (const entry of manifest.files) {
    await bucket.put(keys.file(manifest.version, entry.path), uploaded[entry.path] ?? "");
  }
  await bucket.put(keys.manifest(manifest.version), JSON.stringify(manifest));
  await bucket.put(keys.current, manifest.version);
  return manifest.version;
}
