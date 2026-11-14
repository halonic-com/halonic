import {
  checkPublicWorkspacePath,
  type DefinitionSource,
  isPrivateWorkspacePath,
} from "@halonicjs/ports";
import {
  checkSnapshotVersion,
  DefinitionSnapshotError,
  defaultSnapshotPrefix,
  parseSnapshotManifest,
  type SnapshotFileEntry,
  type SnapshotManifest,
  sha256Hex,
  snapshotKeys,
} from "./definition-snapshot.ts";

/** The one R2 call the source makes. A Worker's `R2Bucket` binding fits it, and so does a wrapper around one, which a test uses to count the reads. */
export interface SnapshotBucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

/** Options for {@link R2DefinitionSource}. */
export interface R2DefinitionSourceOptions {
  /** Where in the bucket the snapshots live; ends in `/`. */
  readonly keyPrefix?: string;
  /**
   * The snapshot to serve. Leave it out to serve the one `current` names, as
   * it was when the source first needed it.
   */
  readonly version?: string;
}

/**
 * The workspace files `halonic deploy` uploaded, read from R2. It has no write
 * side: a deployed workspace changes only by deploying again.
 *
 * `list` and `read` answer from the snapshot's manifest, so R2 is never listed
 * and a path that isn't in the manifest never becomes a key. Each file is
 * checked against the manifest's hash as it is read, so a damaged snapshot
 * fails loudly instead of serving other text.
 *
 * A source serves one version for its whole life: it looks up `current` once.
 * Make a new source per request, so a deploy in between changes nothing
 * mid-request.
 */
export class R2DefinitionSource implements DefinitionSource {
  readonly location: string;
  readonly #bucket: SnapshotBucket;
  readonly #keys: ReturnType<typeof snapshotKeys>;
  readonly #fixedVersion: string | undefined;
  #manifest: Promise<SnapshotManifest> | undefined;

  constructor(bucket: SnapshotBucket, options: R2DefinitionSourceOptions = {}) {
    const prefix = options.keyPrefix ?? defaultSnapshotPrefix;
    this.#bucket = bucket;
    this.#keys = snapshotKeys(prefix);
    if (options.version !== undefined) {
      checkSnapshotVersion(options.version);
    }
    this.#fixedVersion = options.version;
    this.location = `r2:${prefix}`;
  }

  async list(dir?: string): Promise<string[]> {
    if (dir !== undefined) {
      checkPublicWorkspacePath(dir);
    }
    const { files } = await this.#loadManifest();
    return files
      .map((entry) => entry.path)
      .filter((path) => !isPrivateWorkspacePath(path))
      .filter((path) => dir === undefined || path.startsWith(`${dir}/`));
  }

  async read(path: string): Promise<string | null> {
    checkPublicWorkspacePath(path);
    const manifest = await this.#loadManifest();
    const entry = manifest.files.find((candidate) => candidate.path === path);
    if (entry === undefined) {
      return null;
    }
    return this.#readFile(manifest.version, entry);
  }

  async version(): Promise<string> {
    return (await this.#loadManifest()).version;
  }

  #loadManifest(): Promise<SnapshotManifest> {
    // A failed load isn't kept, so the next call tries again (a deploy may have finished).
    this.#manifest ??= this.#fetchManifest().catch((error: unknown) => {
      this.#manifest = undefined;
      throw error;
    });
    return this.#manifest;
  }

  async #fetchManifest(): Promise<SnapshotManifest> {
    const version = this.#fixedVersion ?? (await this.#currentVersion());
    const object = await this.#bucket.get(this.#keys.manifest(version));
    if (object === null) {
      throw new DefinitionSnapshotError(`The snapshot ${version} has no manifest.`);
    }
    const manifest = parseSnapshotManifest(new TextDecoder().decode(await object.arrayBuffer()));
    if (manifest.version !== version) {
      throw new DefinitionSnapshotError(
        `The manifest of snapshot ${version} names another version.`,
      );
    }
    return manifest;
  }

  async #currentVersion(): Promise<string> {
    const object = await this.#bucket.get(this.#keys.current);
    if (object === null) {
      throw new DefinitionSnapshotError("No workspace snapshot has been deployed.");
    }
    const version = new TextDecoder().decode(await object.arrayBuffer()).trim();
    checkSnapshotVersion(version);
    return version;
  }

  async #readFile(version: string, entry: SnapshotFileEntry): Promise<string> {
    const object = await this.#bucket.get(this.#keys.file(version, entry.path));
    if (object === null) {
      throw new DefinitionSnapshotError(`The snapshot ${version} lacks the file ${entry.path}.`);
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.length !== entry.bytes || (await sha256Hex(bytes)) !== entry.sha256) {
      throw new DefinitionSnapshotError(`The file ${entry.path} doesn't match its manifest hash.`);
    }
    return new TextDecoder().decode(bytes);
  }
}
