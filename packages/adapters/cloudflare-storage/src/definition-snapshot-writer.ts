import {
  buildSnapshotManifest,
  defaultSnapshotPrefix,
  snapshotKeys,
} from "./definition-snapshot.ts";
import {
  formatRunDefinitionsIndex,
  type IndexedHubs,
  runDefinitionsIndexPath,
} from "./run-definitions-index.ts";
import { snapshotIndexPaths } from "./snapshot-index-paths.ts";
import { formatRoutineIndex, type IndexedRoutine, routineIndexPath } from "./webhook-routines.ts";

/** The indexes a snapshot holds next to the workspace files, built from the same files. */
export interface SnapshotIndexes {
  /** The placed routines, which the Worker finds webhooks in. */
  readonly routines: readonly IndexedRoutine[];
  /**
   * Each hub's definitions, which the Worker starts runs from. Left out, the
   * snapshot has no run-definitions index, and a run the Worker starts from
   * it is refused with a message to deploy again.
   */
  readonly runDefinitions?: IndexedHubs;
}

/** The one R2 call the writer makes. */
export interface SnapshotWriteBucket {
  put(key: string, value: string | Uint8Array): Promise<unknown>;
}

/**
 * Uploads a workspace as a snapshot: the files, the routine index the
 * Worker reads webhooks from and the run-definitions index it starts runs
 * from, then the manifest, then `current`, so a half-finished upload is never
 * the one served. Private files are left out. This is the low-level call: it
 * trusts that `indexes` are those of `files`.
 * A deploy calls `writeWorkspaceSnapshot` of
 * `@halonicjs/target-cloudflare-deploy`, which builds them from the files, so
 * they never differ. An index holds only what the workspace files hold, and
 * it is listed in the manifest with its hash like any file, so a Worker
 * version pinned to a snapshot reads that snapshot's indexes. This is the write
 * side `halonic deploy` uses; the Worker only reads.
 *
 * @returns the version that `current` now names
 * @throws RangeError for a path the port forbids, or a file at an index's own path
 */
export async function writeDefinitionSnapshot(
  bucket: SnapshotWriteBucket,
  files: Readonly<Record<string, string>>,
  indexes: SnapshotIndexes,
  keyPrefix: string = defaultSnapshotPrefix,
): Promise<string> {
  const taken = snapshotIndexPaths.find((path) => path in files);
  if (taken !== undefined) {
    throw new RangeError(`${taken} is where the snapshot keeps one of its indexes.`);
  }
  const uploaded: Record<string, string> = {
    ...files,
    [routineIndexPath]: formatRoutineIndex(indexes.routines),
    ...(indexes.runDefinitions === undefined
      ? {}
      : { [runDefinitionsIndexPath]: formatRunDefinitionsIndex(indexes.runDefinitions) }),
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
