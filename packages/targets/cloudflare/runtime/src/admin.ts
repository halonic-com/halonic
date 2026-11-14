import { bytesToHex, constantTimeEqual } from "@halonicjs/std";
import type { RuntimeEnv } from "./env.ts";
import { serverConfigOf } from "./serve-config.ts";
import { workerSecrets } from "./worker-secrets.ts";

/**
 * The Worker secret that opens the export and import routes: the SHA-256 of the
 * one-job admin key, in lower-case hex (`HALONIC_SECRET_ADMIN_KEY_HASH`). The
 * Worker never holds the key itself, so reading the secret back (a workspace may
 * pick any secret name) gives nothing that opens a route. Without it, no
 * admin route exists.
 */
export const adminKeySecretName = "admin-key-hash";

/** Every admin route starts with this. */
export const adminPathPrefix = "/admin/";

/** What an admin route does once the key has been checked. */
export type AdminHandler = (request: Request, env: RuntimeEnv) => Promise<Response> | Response;

/** One route behind the admin key. */
export interface AdminRoute {
  readonly method: string;
  /** The path; with `below`, the folder whose every path under it the route answers. */
  readonly path: string;
  readonly below?: boolean;
  readonly handler: AdminHandler;
}

function matches(route: AdminRoute, request: Request, pathname: string): boolean {
  if (route.method !== request.method) return false;
  return route.below === true
    ? pathname.startsWith(`${route.path}/`) && pathname.length > route.path.length + 1
    : pathname === route.path;
}

function refusal(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status, headers: { "cache-control": "no-store" } });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Whether the request carries the admin key: `Authorization: Bearer <key>`, and
 * nothing else (never a URL, which logs keep). Both sides are hashed first, so
 * the comparison takes the same time for every guess whatever its length.
 */
async function carriesAdminKey(request: Request, storedHash: string): Promise<boolean> {
  const given = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (given === undefined) return false;
  const encoder = new TextEncoder();
  return constantTimeEqual(
    encoder.encode(await sha256Hex(given)),
    encoder.encode(storedHash.trim().toLowerCase()),
  );
}

/**
 * Whether the request may reach the admin routes at all: it is for a host name
 * the deployment answers to and no page sent it. A request that isn't falls
 * through to `host/server`, which refuses it as it refuses any other.
 */
function mayReachAdmin(request: Request, env: RuntimeEnv): boolean {
  if (request.headers.has("origin")) return false;
  try {
    const hosts = serverConfigOf(env).allowedHosts.map((name) => name.toLowerCase());
    return hosts.includes(request.headers.get("host")?.toLowerCase() ?? "");
  } catch {
    return false;
  }
}

/**
 * Answers an admin route, or `undefined` when there is none to answer: the path
 * isn't an admin path, the deployment has no admin key (so a normal deployment
 * has no export surface and `/admin/...` is the same 404 as any unknown path),
 * or the request isn't for an allowed host name. With a key set, a request
 * without the right one is 401, and the answer carries no hint of the key.
 *
 * @param routes - what the routes do; only a test passes its own
 */
export async function answerAdmin(
  request: Request,
  env: RuntimeEnv,
  routes: readonly AdminRoute[],
): Promise<Response | undefined> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith(adminPathPrefix)) return undefined;
  const storedHash = await workerSecrets(env).get(adminKeySecretName);
  if (storedHash === null || !mayReachAdmin(request, env)) return undefined;
  if (!(await carriesAdminKey(request, storedHash))) {
    return refusal(401, "unauthorized", "This address needs the admin key.");
  }
  const handler = routes.find((route) => matches(route, request, pathname))?.handler;
  return handler === undefined
    ? refusal(404, "not_found", "There is nothing at this address.")
    : handler(request, env);
}
