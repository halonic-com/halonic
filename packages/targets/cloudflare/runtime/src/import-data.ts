import { tokenCollection } from "@halonicjs/adapter-token-store";
import type { RuntimeExportManifest } from "@halonicjs/format/runtime-export";
import {
  type BlobStore,
  formatLogLines,
  formatRecordLines,
  isBlobHash,
  isRunId,
  parseLogLines,
  parseRecordLines,
  type RecordStore,
  type RunStore,
} from "@halonicjs/ports";
import { recordFileName, sha256Hex } from "./export-data.ts";

/** The stores an import writes, in the shape the Worker's adapters already have. */
export interface ImportTarget {
  readonly records: Pick<RecordStore, "append" | "changes">;
  readonly runStore: Pick<RunStore, "append" | "events">;
  readonly blobs: Pick<BlobStore, "get" | "put">;
}

/** Where the files of an import wait until `POST /admin/import` has checked them all. */
export interface StagingArea {
  put(path: string, bytes: Uint8Array): Promise<void>;
  /** The staged bytes, or `null` when nothing is staged under that path. */
  get(path: string): Promise<Uint8Array | null>;
  delete(path: string): Promise<void>;
}

/** What an import came to: how many files of each kind the deployment now holds. */
export interface ImportCounts {
  runs: number;
  records: number;
  blobs: number;
}

/** What stopped an import. Nothing was applied in each case. */
export type ImportRefusalCode =
  /** A file the manifest lists was never staged. */
  | "files_missing"
  /** A staged file's size or SHA-256 isn't the manifest's. */
  | "files_differ"
  /** A staged file isn't a log or blob this deployment can take, such as the sign-in tokens' collection. */
  | "files_refused"
  /** The deployment already holds other data under the same run id or collection. */
  | "conflict";

/** Thrown when an import can't go ahead. It names paths, never what is in them. */
export class ImportRefusal extends Error {
  override readonly name = "ImportRefusal";
  readonly code: ImportRefusalCode;
  readonly paths: readonly string[];

  constructor(code: ImportRefusalCode, paths: readonly string[]) {
    super(`The import was refused (${code}).`);
    this.code = code;
    this.paths = paths;
  }
}

/** The biggest file an import takes: a Worker holds one file in memory at a time. */
export const maxImportFileBytes = 50 * 1024 * 1024;

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
const recordPath = /^records\/[0-9a-f]{64}\.jsonl$/;
const blobPath = /^blobs\/([0-9a-f]{2})\/([0-9a-f]{64})$/;

/** Whether a path has one of the three shapes of the export's layout (the manifest's own rule is checked on `POST`). */
export function isImportPath(path: string): boolean {
  if (recordPath.test(path)) return true;
  if (path.startsWith("runs/") && path.endsWith(".jsonl")) {
    return isRunId(path.slice("runs/".length, -".jsonl".length));
  }
  const blob = blobPath.exec(path);
  return blob !== null && blob[2]?.startsWith(blob[1] ?? "") === true;
}

/** What importing one file would do, worked out against what the deployment holds now. */
interface Plan {
  readonly kind: keyof ImportCounts;
  /** The deployment holds exactly this data already, so a repeated import is a no-op. */
  readonly present: boolean;
  /** The deployment holds other data under the same name. */
  readonly conflicts: boolean;
  apply(): Promise<void>;
}

class FileRefused extends Error {}

function text(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new FileRefused("not UTF-8 text");
  }
}

/** Runs a parser and turns what it throws into a refusal of the file, so no message of its own reaches an answer. */
function parsed<T>(read: () => T): T {
  try {
    return read();
  } catch {
    throw new FileRefused("not a log of this format");
  }
}

async function planRun(target: ImportTarget, path: string, bytes: Uint8Array): Promise<Plan> {
  const runId = path.slice("runs/".length, -".jsonl".length);
  const lines = text(bytes);
  const events = parsed(() => parseLogLines(lines, runId, path));
  if (events.length === 0) throw new FileRefused("empty log");
  const existing = formatLogLines(await target.runStore.events(runId));
  return {
    kind: "runs",
    present: existing === lines,
    conflicts: existing !== "" && existing !== lines,
    async apply() {
      const result = await target.runStore.append(runId, 0, events);
      if (!result.ok) throw new ImportRefusal("conflict", [path]);
    },
  };
}

async function planRecords(target: ImportTarget, path: string, bytes: Uint8Array): Promise<Plan> {
  const lines = text(bytes);
  const firstLine = lines.slice(0, Math.max(lines.indexOf("\n"), 0));
  const collection = parsed(() => (JSON.parse(firstLine) as { collection?: unknown }).collection);
  // The file's name is the hash of its collection's name, so a file can't be filed under another one.
  if (typeof collection !== "string" || (await recordFileName(collection)) !== path) {
    throw new FileRefused("not the log of the collection its name says");
  }
  if (collection === tokenCollection)
    throw new FileRefused("the sign-in tokens are never imported");
  const changes = parsed(() => parseRecordLines(lines, collection, path));
  const existing = formatRecordLines(await target.records.changes(collection));
  return {
    kind: "records",
    present: existing === lines,
    conflicts: existing !== "" && existing !== lines,
    apply: () => target.records.append(changes),
  };
}

async function planBlob(target: ImportTarget, path: string, bytes: Uint8Array): Promise<Plan> {
  const hash = path.slice(path.lastIndexOf("/") + 1);
  if (!isBlobHash(hash)) throw new FileRefused("not a blob hash");
  return {
    kind: "blobs",
    present: (await target.blobs.get(hash)) !== null,
    // The same hash is the same bytes, whatever is there.
    conflicts: false,
    async apply() {
      await target.blobs.put(bytes, "application/octet-stream");
    },
  };
}

function planFile(target: ImportTarget, path: string, bytes: Uint8Array): Promise<Plan> {
  if (path.startsWith("runs/")) return planRun(target, path, bytes);
  if (path.startsWith("records/")) return planRecords(target, path, bytes);
  return planBlob(target, path, bytes);
}

/** Reads each staged file against the manifest's size and SHA-256, one at a time. */
async function checkStaged(staging: StagingArea, manifest: RuntimeExportManifest): Promise<void> {
  const missing: string[] = [];
  const differing: string[] = [];
  for (const file of manifest.files) {
    const bytes = await staging.get(file.path);
    if (bytes === null) missing.push(file.path);
    else if (bytes.byteLength !== file.bytes || (await sha256Hex(bytes)) !== file.sha256) {
      differing.push(file.path);
    }
  }
  if (missing.length > 0) throw new ImportRefusal("files_missing", missing);
  if (differing.length > 0) throw new ImportRefusal("files_differ", differing);
}

/** Works out every file's plan, which writes nothing, and refuses the import when any file can't be applied. */
async function planAll(
  target: ImportTarget,
  staging: StagingArea,
  manifest: RuntimeExportManifest,
  visit: (path: string, plan: Plan) => Promise<void>,
): Promise<void> {
  const refused: string[] = [];
  const conflicting: string[] = [];
  for (const { path } of manifest.files) {
    const bytes = await staging.get(path);
    if (bytes === null) throw new ImportRefusal("files_missing", [path]);
    try {
      const plan = await planFile(target, path, bytes);
      if (plan.conflicts) conflicting.push(path);
      else await visit(path, plan);
    } catch (error) {
      if (!(error instanceof FileRefused)) throw error;
      refused.push(path);
    }
  }
  if (refused.length > 0) throw new ImportRefusal("files_refused", refused);
  if (conflicting.length > 0) throw new ImportRefusal("conflict", conflicting);
}

/**
 * Applies the staged files of an export to the deployment, once every one of them
 * is there and matches the manifest.
 *
 * The work is in three passes, each reading one file at a time: the sizes and
 * hashes, then whether each file can be applied (a conflicting or refused file
 * stops the import before anything is written), then the writes. A file the
 * deployment holds already, exactly, is skipped, so an import that stopped in the
 * middle can be sent again. The staged files are removed after a full success.
 *
 * @throws ImportRefusal naming the paths at fault; nothing was applied
 */
export async function importStaged(
  target: ImportTarget,
  staging: StagingArea,
  manifest: RuntimeExportManifest,
): Promise<ImportCounts> {
  await checkStaged(staging, manifest);
  await planAll(target, staging, manifest, async () => {});
  const counts: ImportCounts = { runs: 0, records: 0, blobs: 0 };
  await planAll(target, staging, manifest, async (_path, plan) => {
    if (!plan.present) await plan.apply();
    counts[plan.kind] += 1;
  });
  for (const { path } of manifest.files) await staging.delete(path);
  return counts;
}
