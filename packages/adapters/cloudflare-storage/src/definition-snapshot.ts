import { isPrivateWorkspacePath } from "@halonicjs/ports";
import { bytesToHex } from "@halonicjs/std";

/** Where in the bucket the snapshots go, unless the caller names another place. */
export const defaultSnapshotPrefix = "definitions/";

/** The format of the manifest. A snapshot in another format is refused, not guessed at. */
export const snapshotFormatVersion = 1;

/** One workspace file as the manifest lists it. */
export interface SnapshotFileEntry {
  readonly path: string;
  /** Size of the file's UTF-8 text. */
  readonly bytes: number;
  /** Lowercase hex SHA-256 of the file's UTF-8 bytes. */
  readonly sha256: string;
}

/** What `manifest.json` holds: the files of one version of the workspace, sorted by path. */
export interface SnapshotManifest {
  readonly formatVersion: typeof snapshotFormatVersion;
  /** `sha256:` and the hash of the file list, so the same files always give the same version. */
  readonly version: string;
  readonly files: readonly SnapshotFileEntry[];
}

/** The snapshot is damaged, or in a format this code doesn't read. */
export class DefinitionSnapshotError extends Error {
  override readonly name = "DefinitionSnapshotError";
}

/** The three kinds of object a snapshot keeps, named by the version they belong to. */
export function snapshotKeys(prefix: string) {
  return {
    /** The object that says which version is served. */
    current: `${prefix}current`,
    manifest: (version: string) => `${prefix}${version}/manifest.json`,
    file: (version: string, path: string) => `${prefix}${version}/files/${path}`,
  };
}

/**
 * Makes the manifest of a workspace's files. Private files (`.git`, `.env` and
 * the like) are left out, so they never reach the bucket.
 */
export async function buildSnapshotManifest(
  files: Readonly<Record<string, string>>,
): Promise<SnapshotManifest> {
  const entries: SnapshotFileEntry[] = [];
  for (const path of Object.keys(files).sort()) {
    if (isPrivateWorkspacePath(path)) {
      continue;
    }
    const bytes = utf8(files[path] ?? "");
    entries.push({ path, bytes: bytes.length, sha256: await sha256Hex(bytes) });
  }
  const listing = entries.map((entry) => `${entry.path} ${entry.bytes} ${entry.sha256}\n`).join("");
  const version = `sha256:${await sha256Hex(utf8(listing))}`;
  return { formatVersion: snapshotFormatVersion, version, files: entries };
}

/** Reads `manifest.json`'s text; the files are checked one by one, as they are read. */
export function parseSnapshotManifest(text: string): SnapshotManifest {
  const manifest: unknown = JSON.parse(text);
  if (
    !isObject(manifest) ||
    !Array.isArray(manifest.files) ||
    typeof manifest.version !== "string"
  ) {
    throw new DefinitionSnapshotError("The snapshot's manifest isn't in the expected shape.");
  }
  if (manifest.formatVersion !== snapshotFormatVersion) {
    throw new DefinitionSnapshotError(
      `This snapshot is in format ${String(manifest.formatVersion)}, and this Halonic reads format ${snapshotFormatVersion}. Update Halonic.`,
    );
  }
  const files = manifest.files.map((entry: unknown): SnapshotFileEntry => {
    if (
      !isObject(entry) ||
      typeof entry.path !== "string" ||
      typeof entry.bytes !== "number" ||
      typeof entry.sha256 !== "string"
    ) {
      throw new DefinitionSnapshotError("A file entry in the snapshot's manifest is malformed.");
    }
    return { path: entry.path, bytes: entry.bytes, sha256: entry.sha256 };
  });
  return { formatVersion: snapshotFormatVersion, version: manifest.version, files };
}

/** SHA-256 of the bytes as 64 lowercase hex characters. */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

/** The UTF-8 bytes of the text, in a buffer of their own (what `crypto.subtle` takes). */
function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(text));
}

/** The fields the manifest may hold, before they are checked. */
interface RawManifest {
  formatVersion?: unknown;
  version?: unknown;
  files?: unknown;
  path?: unknown;
  bytes?: unknown;
  sha256?: unknown;
}

function isObject(value: unknown): value is RawManifest {
  return typeof value === "object" && value !== null;
}
