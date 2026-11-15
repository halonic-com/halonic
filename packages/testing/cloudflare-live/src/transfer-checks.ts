import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  RUNTIME_EXPORT_MANIFEST,
  type RuntimeExportManifest,
  runtimeExportManifestSchema,
} from "@halonicjs/format/runtime-export";
import { isBlobHash, parseLogLines, parseRecordLines } from "@halonicjs/ports";
import {
  exportFromWorker,
  importToWorker,
  type WorkerTransferOptions,
} from "@halonicjs/target-cloudflare-deploy";

/** A deployed Worker the smoke and admin checks call. */
export interface WorkerTarget {
  /** The Worker's address, such as `https://hlt-1-1.example.workers.dev`. */
  readonly baseUrl: string;
  /** Tests inject this; defaults to `fetch`. */
  readonly fetch?: typeof fetch;
}

async function call(
  target: WorkerTarget,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; code: string | undefined; text: string }> {
  const response = await (target.fetch ?? fetch)(new URL(path, target.baseUrl), { headers });
  const text = await response.text();
  let code: string | undefined;
  try {
    const parsed = (JSON.parse(text) as { code?: unknown } | null)?.code;
    code = typeof parsed === "string" ? parsed : undefined;
  } catch {
    code = undefined;
  }
  return { status: response.status, code, text };
}

function expectStatus(
  what: string,
  got: { status: number; code: string | undefined },
  want: number,
) {
  if (got.status !== want) {
    const code = got.code === undefined ? "" : ` ${got.code}`;
    throw new Error(`${what} was answered ${got.status}${code}, expected ${want}.`);
  }
}

/** Checks of a deployed Worker that need no key. Each throws an `Error` naming what differed, never a key or a body. */
export const workerChecks = {
  /** The Worker answers its health route. */
  async smoke(target: WorkerTarget): Promise<void> {
    expectStatus("/health", await call(target, "/health"), 200);
  },

  /**
   * With no admin key set (a normal deployment), `/admin/...` is the same neutral 404 as any unknown
   * path, even for a caller that sends a key.
   */
  async adminClosed(target: WorkerTarget, someKey: string): Promise<void> {
    const unknown = await call(target, "/no-such-path");
    for (const [what, headers] of [
      ["/admin/export without a key", {}],
      ["/admin/export with a key", { authorization: `Bearer ${someKey}` }],
    ] as const) {
      const answer = await call(target, "/admin/export", headers);
      expectStatus(what, answer, unknown.status);
      if (answer.text !== unknown.text) {
        throw new Error(`${what} answered differently from an unknown path.`);
      }
    }
  },

  /**
   * While the key is set: no key, a wrong key, a key in the URL and the right key sent with an
   * `Origin` header are all refused. The right key alone is not tried here: the round trip does.
   */
  async adminRefusesBadKeys(target: WorkerTarget, key: string): Promise<void> {
    const wrong = `${key.startsWith("A") ? "B" : "A"}${key.slice(1)}`;
    expectStatus("/admin/export without a key", await call(target, "/admin/export"), 401);
    expectStatus(
      "/admin/export with a wrong key",
      await call(target, "/admin/export", { authorization: `Bearer ${wrong}` }),
      401,
    );
    expectStatus(
      "/admin/export with the key in the URL",
      await call(target, `/admin/export?key=${encodeURIComponent(key)}`),
      401,
    );
    const withOrigin = await call(target, "/admin/export", {
      authorization: `Bearer ${key}`,
      origin: "https://attacker.example",
    });
    if (withOrigin.status === 200) {
      throw new Error("/admin/export answered 200 to a request that sent an Origin header.");
    }
  },
};

export interface RoundTripOptions extends Pick<WorkerTransferOptions, "baseUrl" | "key" | "fetch"> {
  /** A complete export folder to put into the Worker. */
  readonly source: string;
  /** An empty folder the Worker's export is written to. */
  readonly work: string;
}

/** What a round trip carried. */
export interface RoundTripResult {
  readonly files: number;
  readonly runs: number;
  readonly records: number;
  readonly blobs: number;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readManifest(folder: string): Promise<RuntimeExportManifest> {
  const text = await readFile(join(folder, RUNTIME_EXPORT_MANIFEST), "utf8");
  return runtimeExportManifestSchema.parse(JSON.parse(text));
}

/**
 * Reads an export folder the way a Node import would: the manifest passes the format's schema,
 * every listed file has the manifest's size and SHA-256, run logs and record logs parse, a blob is
 * named by its hash, and no file is unlisted.
 *
 * @throws Error naming the path that is wrong, never what is in it
 */
export async function readAsNode(folder: string): Promise<RoundTripResult> {
  const manifest = await readManifest(folder);
  const count = { runs: 0, records: 0, blobs: 0 };
  for (const file of manifest.files) {
    const bytes = await readFile(join(folder, ...file.path.split("/")));
    if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.sha256) {
      throw new Error(`${file.path} is not what the manifest says.`);
    }
    const [kind = "", name = "", blobName] = file.path.split("/");
    try {
      if (kind === "runs") {
        const id = name.replace(/\.jsonl$/, "");
        parseLogLines(Buffer.from(bytes).toString("utf8"), id, file.path);
        count.runs++;
      } else if (kind === "records") {
        readRecordLog(Buffer.from(bytes).toString("utf8"), name.replace(/\.jsonl$/, ""), file.path);
        count.records++;
      } else if (kind === "blobs" && blobName !== undefined && isBlobHash(blobName)) {
        count.blobs++;
      } else {
        throw new Error("not a run, record or blob path");
      }
    } catch {
      throw new Error(`${file.path} can't be read as a ${kind} file.`);
    }
  }
  const onDisk = await filesUnder(folder);
  const listed = new Set([RUNTIME_EXPORT_MANIFEST, ...manifest.files.map((f) => f.path)]);
  const extra = onDisk.filter((path) => !listed.has(path));
  if (extra.length > 0)
    throw new Error(`The folder holds files the manifest doesn't list: ${extra.join(", ")}.`);
  return { files: manifest.files.length, ...count };
}

/** A record log is named by the SHA-256 of its collection's name, which its lines carry. */
function readRecordLog(text: string, hash: string, path: string): void {
  const first =
    text === "" ? undefined : (JSON.parse(text.split("\n")[0] ?? "") as { collection?: unknown });
  const collection = typeof first?.collection === "string" ? first.collection : undefined;
  if (collection !== undefined && sha256(Buffer.from(collection, "utf16le")) !== hash) {
    throw new Error("the file isn't named for its collection");
  }
  parseRecordLines(text, collection ?? "", path);
}

async function filesUnder(folder: string, prefix = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(join(folder, prefix), { withFileTypes: true })) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await filesUnder(folder, path)));
    else found.push(path);
  }
  return found.sort();
}

/**
 * Puts the `source` export into the Worker (twice, since sending an import again is safe), exports
 * what the Worker now holds into `work`, and checks that every source file came back byte for byte
 * and that the result reads as a Node import would read it.
 *
 * @throws Error naming the path that differs, never a key or file content
 */
export async function roundTrip(options: RoundTripOptions): Promise<RoundTripResult> {
  const transfer = {
    baseUrl: options.baseUrl,
    key: options.key,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  };
  const source = await readManifest(options.source);
  await importToWorker({ ...transfer, folder: options.source });
  await importToWorker({ ...transfer, folder: options.source });
  await exportFromWorker({ ...transfer, folder: options.work });
  const back = new Map((await readManifest(options.work)).files.map((f) => [f.path, f.sha256]));
  const differing = source.files
    .filter((file) => back.get(file.path) !== file.sha256)
    .map((file) => file.path);
  if (differing.length > 0) {
    throw new Error(
      `The export did not return these files as they were put in: ${differing.join(", ")}.`,
    );
  }
  return readAsNode(options.work);
}
