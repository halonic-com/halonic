import {
  type RuntimeExportManifest,
  runtimeExportManifestSchema,
} from "@halonicjs/format/runtime-export";
import type { AdminHandler, AdminRoute } from "./admin.ts";
import type { RuntimeEnv } from "./env.ts";
import { ConfigurationError } from "./env.ts";
import {
  buildManifest,
  ExportSecretError,
  type ExportSource,
  readExportFile,
} from "./export-data.ts";
import {
  ImportRefusal,
  type ImportTarget,
  importStaged,
  isImportPath,
  maxImportFileBytes,
  type StagingArea,
} from "./import-data.ts";
import { createRuntime } from "./runtime.ts";
import { serverConfigOf } from "./serve-config.ts";

const exportFilesPath = "/admin/export/files";

function refusal(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** Opens the stores an export reads; only a test passes its own. */
export type OpenExportSource = (env: RuntimeEnv) => Promise<ExportSource>;

const openRuntime: OpenExportSource = (env) => createRuntime(env);

/** What an import writes to, and where it stages the files first. */
export interface ImportDeps {
  readonly target: ImportTarget;
  readonly staging: StagingArea;
}

/** Opens what an import uses; only a test passes its own. */
export type OpenImport = (env: RuntimeEnv) => Promise<ImportDeps>;

/** Staged files go under this prefix of the blobs bucket, which holds blobs only under `blobs/`. */
const stagingPrefix = "import-staging/";

function r2Staging(bucket: R2Bucket): StagingArea {
  return {
    async put(path, bytes) {
      await bucket.put(`${stagingPrefix}${path}`, bytes);
    },
    async get(path) {
      const object = await bucket.get(`${stagingPrefix}${path}`);
      return object === null ? null : new Uint8Array(await object.arrayBuffer());
    },
    async delete(path) {
      await bucket.delete(`${stagingPrefix}${path}`);
    },
  };
}

const openImportDeps: OpenImport = async (env) => ({
  target: await createRuntime(env),
  staging: r2Staging(env.BLOBS),
});

/** Turns the failures an export can have into answers that name no value. */
async function answering(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ExportSecretError) {
      return refusal(409, {
        code: "secret_found",
        message: "The export stopped: a file holds something shaped like a secret.",
        path: error.path,
        shape: error.shape,
      });
    }
    if (error instanceof ImportRefusal) {
      return refusal(409, {
        code: error.code,
        message:
          "The import was stopped. Files written before the stop stay, and sending the import again is safe.",
        paths: error.paths,
      });
    }
    if (error instanceof ConfigurationError) {
      return refusal(503, { code: "unavailable", message: "The server isn't ready." });
    }
    throw error;
  }
}

/** The export's two routes: the manifest, and one file by the path the manifest lists. */
function exportRoutes(open: OpenExportSource): readonly AdminRoute[] {
  const manifest: AdminHandler = (_request, env) =>
    answering(async () => {
      const { deploymentId } = serverConfigOf(env);
      const body = await buildManifest(await open(env), deploymentId, new Date());
      return jsonAnswer(body);
    });

  const file: AdminHandler = (request, env) =>
    answering(async () => {
      const path = decodePath(new URL(request.url).pathname.slice(`${exportFilesPath}/`.length));
      const bytes = path === undefined ? null : await readExportFile(await open(env), path);
      if (bytes === null) {
        return refusal(404, { code: "not_found", message: "The export has no such file." });
      }
      return new Response(bytes, {
        headers: { "content-type": "application/octet-stream", "cache-control": "no-store" },
      });
    });

  return [
    { method: "GET", path: "/admin/export", handler: manifest },
    { method: "GET", path: exportFilesPath, below: true, handler: file },
  ];
}

const importFilesPath = "/admin/import/files";
/** A manifest lists a file per run, collection and blob, a few hundred bytes each. */
const maxManifestBytes = 16 * 1024 * 1024;

/**
 * The body of a request, or `undefined` when it is longer than `limit` bytes.
 * A declared length over the limit is refused before the body is read; a body
 * without one (chunked) is read whole and then measured, which the limits here
 * (50 MiB a file, 16 MiB a manifest) keep within a Worker's memory.
 */
async function boundedBody(request: Request, limit: number): Promise<Uint8Array | undefined> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limit) return undefined;
  const body = new Uint8Array(await request.arrayBuffer());
  return body.byteLength > limit ? undefined : body;
}

function tooLarge(): Response {
  return refusal(413, { code: "too_large", message: "The body is larger than the Worker takes." });
}

/** The import's two routes: stage one file, then check and apply them all against the manifest. */
function importRoutes(open: OpenImport): readonly AdminRoute[] {
  const stage: AdminHandler = (request, env) =>
    answering(async () => {
      const path = decodePath(new URL(request.url).pathname.slice(`${importFilesPath}/`.length));
      if (path === undefined || !isImportPath(path)) {
        return refusal(400, { code: "bad_path", message: "This isn't a path of the export." });
      }
      const bytes = await boundedBody(request, maxImportFileBytes);
      if (bytes === undefined) return tooLarge();
      await (await open(env)).staging.put(path, bytes);
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    });

  const apply: AdminHandler = (request, env) =>
    answering(async () => {
      const body = await boundedBody(request, maxManifestBytes);
      if (body === undefined) return tooLarge();
      const manifest = parseManifest(body);
      if (manifest === undefined) {
        return refusal(400, {
          code: "bad_manifest",
          message: "The body isn't an export manifest.",
        });
      }
      const { target, staging } = await open(env);
      return jsonAnswer({ imported: await importStaged(target, staging, manifest) });
    });

  return [
    { method: "PUT", path: importFilesPath, below: true, handler: stage },
    { method: "POST", path: "/admin/import", handler: apply },
  ];
}

/** The manifest in a request body, or `undefined` when it isn't JSON or doesn't fit the format. */
function parseManifest(body: Uint8Array): RuntimeExportManifest | undefined {
  try {
    const result = runtimeExportManifestSchema.safeParse(
      JSON.parse(new TextDecoder().decode(body)),
    );
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

function jsonAnswer(body: unknown): Response {
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}

/** A path from a URL, or `undefined` when its percent-escapes are malformed. */
function decodePath(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

/**
 * The export and import routes of the Worker, in the paths the contract names
 * (see the package README).
 *
 * @param openExport - opens the stores an export reads; only a test passes its own
 * @param openImport - opens the stores an import writes and its staging area; only a test passes its own
 */
export function adminRoutesOf(
  openExport: OpenExportSource = openRuntime,
  openImport: OpenImport = openImportDeps,
): readonly AdminRoute[] {
  return [...exportRoutes(openExport), ...importRoutes(openImport)];
}

export const adminRoutes: readonly AdminRoute[] = adminRoutesOf();
