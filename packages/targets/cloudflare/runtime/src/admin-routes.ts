import type { AdminHandler, AdminRoute } from "./admin.ts";
import type { RuntimeEnv } from "./env.ts";
import { ConfigurationError } from "./env.ts";
import {
  buildManifest,
  ExportSecretError,
  type ExportSource,
  readExportFile,
} from "./export-data.ts";
import { createRuntime } from "./runtime.ts";
import { serverConfigOf } from "./serve-config.ts";

const exportFilesPath = "/admin/export/files";

function notBuilt(): Response {
  return Response.json(
    { code: "not_implemented", message: "This route isn't built yet." },
    { status: 501, headers: { "cache-control": "no-store" } },
  );
}

function refusal(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** Opens the stores an export reads; only a test passes its own. */
export type OpenExportSource = (env: RuntimeEnv) => Promise<ExportSource>;

const openRuntime: OpenExportSource = (env) => createRuntime(env);

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
 * (see the package README). The export routes answer; the import routes answer
 * 501 once the admin key has been checked, until the next part of HAL-9486.
 *
 * @param open - opens the stores an export reads; only a test passes its own
 */
export function adminRoutesOf(open: OpenExportSource = openRuntime): readonly AdminRoute[] {
  return [
    ...exportRoutes(open),
    { method: "PUT", path: "/admin/import/files", below: true, handler: notBuilt },
    { method: "POST", path: "/admin/import", handler: notBuilt },
  ];
}

export const adminRoutes: readonly AdminRoute[] = adminRoutesOf();
