import { tokenCollection } from "@halonicjs/adapter-token-store";
import {
  RUNTIME_EXPORT_FORMAT_VERSION,
  type RuntimeExportManifest,
} from "@halonicjs/format/runtime-export";
import {
  type BlobStore,
  formatLogLines,
  formatRecordLines,
  isRunId,
  type RecordStore,
  type RunStore,
} from "@halonicjs/ports";
import { bytesToHex, findSecretShape, type SecretShape } from "@halonicjs/std";

/** The stores an export reads, in the shape the Worker's adapters already have. */
export interface ExportSource {
  readonly records: Pick<RecordStore, "changes"> & { collections(): Promise<string[]> };
  readonly runs: { list(): Promise<readonly { readonly id: string }[]> };
  readonly runStore: Pick<RunStore, "events">;
  readonly blobs: Pick<BlobStore, "get"> & { hashes(): Promise<string[]> };
}

/** Thrown when a file of the export holds something shaped like a secret. It names the file and the kind, never the text. */
export class ExportSecretError extends Error {
  override readonly name = "ExportSecretError";
  readonly path: string;
  readonly shape: SecretShape;

  constructor(path: string, shape: SecretShape) {
    super(`${path} holds something shaped like a secret (${shape}).`);
    this.path = path;
    this.shape = shape;
  }
}

/** Where a file of the export is read from; its path is what the manifest lists. */
interface ExportFile {
  readonly path: string;
  /** Reads the file's bytes; `null` when it has gone since the listing. */
  read(): Promise<Uint8Array | null>;
}

const encoder = new TextEncoder();

/** The lower-case hex SHA-256 of some bytes. */
export async function sha256Hex(bytes: ArrayBuffer | ArrayBufferView): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

/** The name `FileRecordStore` gives a collection's log: the SHA-256 of the name in UTF-16LE. */
export async function recordFileName(collection: string): Promise<string> {
  const units = new Uint8Array(collection.length * 2);
  const view = new DataView(units.buffer);
  for (let index = 0; index < collection.length; index += 1) {
    view.setUint16(index * 2, collection.charCodeAt(index), true);
  }
  return `records/${await sha256Hex(units)}.jsonl`;
}

/** The text of a run log, a record log or a text blob must not hold a secret: a run can have handled one. */
function refuseSecrets(path: string, text: string): void {
  const shape = findSecretShape(text);
  if (shape !== undefined) throw new ExportSecretError(path, shape);
}

/** How many bytes of a blob are decoded and scanned at a time, so the text never grows with the blob. */
const scanChunkBytes = 1024 * 1024;

/**
 * How much of a key-shaped run a chunk hands on to the next one. A key is a
 * run of letters, digits, `-` and `_`, so a run that reaches the end of a chunk
 * is scanned again with the start of the next. No real key is this long.
 */
const maxCarriedRunLength = 4096;

function isKeyCharacter(character: string): boolean {
  return /^[A-Za-z0-9_-]$/.test(character);
}

/**
 * The end of the text that may be the start of a key the next chunk finishes.
 * It walks back from the end, so the work is the length of the run, not of the
 * chunk times the length of every run in it.
 */
function carriedTail(text: string): string {
  const earliest = Math.max(0, text.length - maxCarriedRunLength);
  let start = text.length;
  while (start > earliest && isKeyCharacter(text[start - 1] as string)) start -= 1;
  return text.slice(start);
}

/**
 * Scans a blob that is text for secrets, a chunk at a time, so the Worker
 * holds the bytes and one chunk of text, not the whole blob twice over. A blob
 * that isn't valid UTF-8 is bytes rather than text: scanning stops at the
 * first chunk that doesn't decode, and what came before it has been scanned.
 */
export function refuseSecretsInBlob(
  path: string,
  bytes: Uint8Array,
  chunkBytes: number = scanChunkBytes,
): void {
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  let carried = "";
  try {
    for (let start = 0; start < bytes.byteLength; start += chunkBytes) {
      const chunk = bytes.subarray(start, start + chunkBytes);
      const text = carried + decoder.decode(chunk, { stream: true });
      refuseSecrets(path, text);
      carried = carriedTail(text);
    }
    decoder.decode();
  } catch (error) {
    // A fatal decoder throws a TypeError for bytes that aren't UTF-8; a secret is not one.
    if (!(error instanceof TypeError)) throw error;
  }
}

/** Byte order of the paths, which for these ASCII paths is the order the manifest lists them in. */
function comparePaths(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

async function listFiles(source: ExportSource): Promise<ExportFile[]> {
  const files: ExportFile[] = [];
  for (const run of await source.runs.list()) {
    // A run whose id couldn't be a file name has no place in the export's layout.
    if (!isRunId(run.id)) continue;
    const path = `runs/${run.id}.jsonl`;
    files.push({
      path,
      async read() {
        const text = formatLogLines(await source.runStore.events(run.id));
        refuseSecrets(path, text);
        return encoder.encode(text);
      },
    });
  }
  for (const collection of await source.records.collections()) {
    // The sign-in tokens' own collection never leaves the deployment.
    if (collection === tokenCollection) continue;
    const path = await recordFileName(collection);
    files.push({
      path,
      async read() {
        const text = formatRecordLines(await source.records.changes(collection));
        refuseSecrets(path, text);
        return encoder.encode(text);
      },
    });
  }
  for (const hash of await source.blobs.hashes()) {
    const path = `blobs/${hash.slice(0, 2)}/${hash}`;
    files.push({
      path,
      async read() {
        const bytes = await source.blobs.get(hash);
        if (bytes !== null) refuseSecretsInBlob(path, bytes);
        return bytes;
      },
    });
  }
  return files.sort((a, b) => comparePaths(a.path, b.path));
}

/**
 * Lists and measures every file of the deployment's export, one file at a time,
 * so the Worker never holds more than one file in memory.
 *
 * @param deployment - the deployment's id, written into the manifest
 * @param now - the time of the export
 * @throws ExportSecretError when a run log, record log or text blob holds something shaped like a secret; nothing is exported then
 */
export async function buildManifest(
  source: ExportSource,
  deployment: string,
  now: Date,
): Promise<RuntimeExportManifest> {
  const entries: RuntimeExportManifest["files"] = [];
  for (const file of await listFiles(source)) {
    const bytes = await file.read();
    if (bytes === null) continue;
    entries.push({ path: file.path, bytes: bytes.byteLength, sha256: await sha256Hex(bytes) });
  }
  return {
    formatVersion: RUNTIME_EXPORT_FORMAT_VERSION,
    deployment,
    exportedAt: now.toISOString(),
    files: entries,
  };
}

/**
 * Reads one file of the export by its manifest path.
 *
 * @returns the bytes, or `null` when no file of the export has that path
 * @throws ExportSecretError when the file holds something shaped like a secret
 */
export async function readExportFile(
  source: ExportSource,
  path: string,
): Promise<Uint8Array | null> {
  const file = (await listFiles(source)).find((candidate) => candidate.path === path);
  return file === undefined ? null : file.read();
}
