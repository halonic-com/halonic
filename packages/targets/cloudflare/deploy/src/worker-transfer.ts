import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  RUNTIME_EXPORT_MANIFEST,
  type RuntimeExportManifest,
  runtimeExportManifestSchema,
} from "@halonicjs/format/runtime-export";
import { DeployError, redact } from "./errors.ts";

export interface WorkerTransferOptions {
  /** The deployment's own address, such as `https://app.example.com`. It must be HTTPS and one of the Worker's allowed host names. */
  readonly baseUrl: string;
  /** The key `withAdminKey` gave the job. Sent only as `Authorization: Bearer`, never in a URL. */
  readonly key: string;
  /** The export folder: where an export writes, where an import reads. */
  readonly folder: string;
  /** Ctrl C: the job stops at the next request. */
  readonly signal?: AbortSignal;
  /** Tests inject this. */
  readonly fetch?: typeof fetch;
}

/** What an import came to, as the Worker counted it. */
export interface ImportedCounts {
  readonly runs: number;
  readonly records: number;
  readonly blobs: number;
}

/** How often an import stages again what the Worker said was missing or different, the first try excluded. */
const restageAttempts = 1;

/** What the Worker's answer said, only the parts that name no data. */
interface Refusal {
  readonly status: number;
  readonly code?: string;
  readonly path?: string;
  readonly shape?: string;
  readonly paths?: readonly string[];
}

/**
 * Writes the deployment's export into `folder`: every file the Worker's manifest lists, each checked
 * against the manifest's size and SHA-256, then the manifest itself last, so a folder that has a
 * manifest is complete.
 *
 * @returns the manifest that was written
 * @throws DeployError `export-refused` when the Worker stopped the export (a file holds something shaped like a secret, the answer names the file and the kind)
 * @throws DeployError `transfer-failed` for any other answer, a file that isn't the manifest's, or a folder that isn't empty
 */
export async function exportFromWorker(
  options: WorkerTransferOptions,
): Promise<RuntimeExportManifest> {
  return guarded(options, async () => {
    await requireEmptyFolder(options.folder);
    const manifest = parseManifest(await getBytes(options, "/admin/export"));
    for (const file of manifest.files) {
      const bytes = await getBytes(options, `/admin/export/files/${encodePath(file.path)}`);
      if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.sha256) {
        throw failed(`The Worker sent ${file.path} different from its manifest.`);
      }
      const target = join(options.folder, ...file.path.split("/"));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    await writeFile(
      join(options.folder, RUNTIME_EXPORT_MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    return manifest;
  });
}

/**
 * Sends the export in `folder` to the Worker: stages each file, then posts the manifest. A file that
 * isn't what the manifest says is refused before anything is sent. When the Worker says files are
 * missing or differ, those are staged once more and the manifest posted again.
 *
 * @returns how many runs, records and blobs the Worker now holds
 * @throws DeployError `import-refused` when the Worker refused the import (its code and the paths, never the data)
 * @throws DeployError `transfer-failed` for any other answer or a folder that isn't a complete export
 */
export async function importToWorker(options: WorkerTransferOptions): Promise<ImportedCounts> {
  return guarded(options, async () => {
    const manifest = await readFolderManifest(options.folder);
    const bytesOf = async (path: string): Promise<Uint8Array> => {
      const file = manifest.files.find((f) => f.path === path);
      if (!file) throw failed(`${path} isn't in the manifest.`);
      const bytes = new Uint8Array(await readFile(join(options.folder, ...path.split("/"))));
      if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.sha256) {
        throw failed(`${path} in the folder isn't what the manifest says.`);
      }
      return bytes;
    };
    // Nothing leaves this machine until every file is what the manifest says.
    for (const file of manifest.files) await bytesOf(file.path);

    return stageAndPost(options, manifest, bytesOf);
  });
}

/** Stages every file and posts the manifest; once more for the paths the Worker named as missing or different. */
async function stageAndPost(
  options: WorkerTransferOptions,
  manifest: RuntimeExportManifest,
  bytesOf: (path: string) => Promise<Uint8Array>,
): Promise<ImportedCounts> {
  let toStage = manifest.files.map((f) => f.path);
  for (let attempt = 0; ; attempt++) {
    for (const path of toStage) {
      const sent = await send(options, "PUT", `/admin/import/files/${encodePath(path)}`, {
        body: await bytesOf(path),
      });
      if (sent.status !== 204) throw refused(sent);
    }
    const posted = await send(options, "POST", "/admin/import", {
      body: new TextEncoder().encode(JSON.stringify(manifest)),
      contentType: "application/json",
    });
    if (posted.status === 200) return countsOf(posted.body);
    const refusal = refusalOf(posted);
    const restage =
      refusal.code === "files_missing" || refusal.code === "files_differ"
        ? (refusal.paths ?? [])
        : [];
    if (restage.length === 0 || attempt >= restageAttempts) throw refusedWith(refusal);
    toStage = [...restage];
  }
}

/** Runs `work`, and keeps the key out of every error that leaves. */
async function guarded<T>(options: WorkerTransferOptions, work: () => Promise<T>): Promise<T> {
  const base = new URL(options.baseUrl);
  if (base.protocol !== "https:") {
    throw failed("The deployment's address must be HTTPS: the key must not travel in the clear.");
  }
  try {
    return await work();
  } catch (error) {
    if (error instanceof DeployError) {
      throw new DeployError(error.code, redact(error.message, [options.key]));
    }
    // A network error or a failed read: its text may name a URL, never a key, but the key is removed anyway.
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new DeployError(
      "transfer-failed",
      redact(`The transfer stopped (${reason}).`, [options.key]),
    );
  }
}

interface Answer {
  readonly status: number;
  readonly body: Uint8Array;
}

async function send(
  options: WorkerTransferOptions,
  method: "GET" | "PUT" | "POST",
  path: string,
  request: { readonly body?: Uint8Array; readonly contentType?: string } = {},
): Promise<Answer> {
  const doFetch = options.fetch ?? fetch;
  const url = new URL(path, options.baseUrl);
  const response = await doFetch(url, {
    method,
    headers: {
      authorization: `Bearer ${options.key}`,
      ...(request.contentType ? { "content-type": request.contentType } : {}),
    },
    ...(request.body ? { body: request.body } : {}),
    // The key must never follow a redirect to another address.
    redirect: "error",
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return { status: response.status, body: new Uint8Array(await response.arrayBuffer()) };
}

async function getBytes(options: WorkerTransferOptions, path: string): Promise<Uint8Array> {
  const answer = await send(options, "GET", path);
  if (answer.status !== 200) throw refused(answer);
  return answer.body;
}

/** Only the fields that name no data are read from an answer. */
function refusalOf(answer: Answer): Refusal {
  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(answer.body));
    if (typeof json !== "object" || json === null) return { status: answer.status };
    const record = json as {
      code?: unknown;
      path?: unknown;
      shape?: unknown;
      paths?: unknown;
    };
    const text = (value: unknown) => (typeof value === "string" ? value.slice(0, 200) : undefined);
    const code = text(record.code);
    const path = text(record.path);
    const shape = text(record.shape);
    const paths = Array.isArray(record.paths)
      ? record.paths.filter((p): p is string => typeof p === "string").slice(0, 100)
      : undefined;
    return {
      status: answer.status,
      ...(code ? { code } : {}),
      ...(path ? { path } : {}),
      ...(shape ? { shape } : {}),
      ...(paths ? { paths } : {}),
    };
  } catch {
    return { status: answer.status };
  }
}

function refused(answer: Answer): DeployError {
  return refusedWith(refusalOf(answer));
}

function refusedWith(refusal: Refusal): DeployError {
  if (refusal.code === "secret_found") {
    return new DeployError(
      "export-refused",
      `The export stopped: ${refusal.path ?? "a file"} holds something shaped like a secret (${refusal.shape ?? "unknown shape"}). Nothing was exported from it.`,
    );
  }
  if (
    refusal.code === "files_missing" ||
    refusal.code === "files_differ" ||
    refusal.code === "files_refused" ||
    refusal.code === "conflict"
  ) {
    const paths = refusal.paths?.length ? `: ${refusal.paths.join(", ")}` : "";
    return new DeployError(
      "import-refused",
      `The Worker refused the import (${refusal.code})${paths}. Nothing was applied.`,
    );
  }
  const code = refusal.code ? `, ${refusal.code}` : "";
  return failed(`The Worker answered ${refusal.status}${code}.`);
}

function failed(message: string): DeployError {
  return new DeployError("transfer-failed", message);
}

function countsOf(body: Uint8Array): ImportedCounts {
  try {
    const json = JSON.parse(new TextDecoder().decode(body)) as {
      imported?: Partial<Record<keyof ImportedCounts, unknown>>;
    };
    const n = (value: unknown) => (typeof value === "number" && value >= 0 ? value : undefined);
    const runs = n(json.imported?.runs);
    const records = n(json.imported?.records);
    const blobs = n(json.imported?.blobs);
    if (runs !== undefined && records !== undefined && blobs !== undefined) {
      return { runs, records, blobs };
    }
  } catch {
    // Falls through to the error below.
  }
  throw failed("The Worker's answer to the import wasn't the counts it promises.");
}

function parseManifest(bytes: Uint8Array): RuntimeExportManifest {
  try {
    const result = runtimeExportManifestSchema.safeParse(
      JSON.parse(new TextDecoder().decode(bytes)),
    );
    if (result.success) return result.data;
  } catch {
    // Falls through to the error below.
  }
  throw failed("The manifest isn't an export manifest of this version.");
}

async function readFolderManifest(folder: string): Promise<RuntimeExportManifest> {
  let bytes: Buffer;
  try {
    bytes = await readFile(join(folder, RUNTIME_EXPORT_MANIFEST));
  } catch {
    throw failed(`${folder} has no ${RUNTIME_EXPORT_MANIFEST}, so it isn't a complete export.`);
  }
  return parseManifest(new Uint8Array(bytes));
}

async function requireEmptyFolder(folder: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(folder);
  } catch {
    await mkdir(folder, { recursive: true });
    return;
  }
  if (entries.length > 0) throw failed(`${folder} isn't empty. Export to a new folder.`);
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
