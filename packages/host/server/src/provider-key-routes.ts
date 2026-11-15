import {
  checkSecretValue,
  isHalonicSecretName,
  isPluginSecretName,
  isSecretName,
  type SecretStore,
} from "@halonicjs/ports";
import type { ProviderKeyStore, RequestContext, ServerPorts } from "./api.ts";
import { errorResponse, type ServerError, serverErrors } from "./errors.ts";
import { refuseNonJson, refuseOtherSite } from "./secret-request.ts";
import { isLoopbackRequest, isSecureConnection } from "./security.ts";

/** The address of a provider key: `/api/secrets/<name>`. */
export const providerKeyPathPrefix = "/api/secrets/";

/** Whether a path belongs to the key routes, which the request log leaves out entirely. */
export function isProviderKeyPath(pathname: string): boolean {
  return pathname.startsWith(providerKeyPathPrefix);
}

/**
 * The key store the routes need, made from a host's `SecretStore`. `has` reads
 * the value to see whether it is there and keeps none of it.
 */
export function providerKeysOf(store: SecretStore): ProviderKeyStore {
  return {
    has: async (name) => (await store.get(name)) !== null,
    set: (name, value) => store.set(name, value),
    remove: (name) => store.remove(name),
  };
}

/**
 * What a {@link ProviderKeyStore} throws from `set` or `remove` when its keys
 * are fixed where the server runs, such as a Worker's secrets. The routes
 * answer 409 `keys_read_only` and log nothing: it is not a failure.
 */
export class ProviderKeysReadOnlyError extends Error {
  constructor() {
    super("The provider keys of this server can't be changed.");
    this.name = "ProviderKeysReadOnlyError";
  }
}

/** The headers of every answer, refusals included: a key's state is not for a cache. */
const noStore = { "cache-control": "no-store" };

function refuse(error: ServerError): Response {
  return errorResponse(error, noStore);
}

function answer(body: Record<string, boolean>): Response {
  return Response.json(body, { headers: noStore });
}

/**
 * The name in the path, decoded once, or `null` when it can't be a provider
 * key's name: empty, a path with more segments (an encoded `/` fails the name
 * rule below), a name Halonic or a plugin owns, or anything else that breaks
 * the name rule. This covers `GET` too, since `GET` on `serve-password` would
 * say whether a password is set.
 */
function readName(rest: string): string | null {
  let name: string;
  try {
    name = decodeURIComponent(rest);
  } catch {
    return null;
  }
  if (!isSecretName(name) || isHalonicSecretName(name) || isPluginSecretName(name)) {
    return null;
  }
  return name;
}

/**
 * Reads the body of a `PUT`. A bad body is never described, because a parse
 * error can quote the text it choked on, and that text can be the key. The
 * value is kept exactly as sent.
 */
function readValue(body: Uint8Array): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const { value } = parsed as Record<string, unknown>;
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  try {
    checkSecretValue(value);
  } catch {
    return null;
  }
  return value;
}

/** A key goes over HTTPS or stays on this computer. There is no way to confirm plain http. */
function refuseInsecureConnection(request: Request, context: RequestContext): ServerError | null {
  const safeToSend = isSecureConnection(request, context) || isLoopbackRequest(request);
  return safeToSend ? null : serverErrors.secretNeedsSecureConnection;
}

/** What a `PUT` carries once its content type, connection and body are checked, in that order. */
type CheckedPut =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: ServerError };

function readPut(request: Request, context: RequestContext, body: Uint8Array): CheckedPut {
  const refusal = refuseNonJson(request) ?? refuseInsecureConnection(request, context);
  if (refusal !== null) {
    return { ok: false, error: refusal };
  }
  const value = readValue(body);
  return value === null
    ? { ok: false, error: serverErrors.secretNotAccepted }
    : { ok: true, value };
}

export interface ProviderKeyRoutes {
  /** Answers `GET`, `PUT` and `DELETE` on `/api/secrets/<name>`; the caller has checked the sign-in. */
  handle(
    request: Request,
    context: RequestContext,
    body: Uint8Array,
    rest: string,
  ): Promise<Response>;
}

/**
 * The write-only provider key routes. A key goes in with `PUT`, comes out with
 * `DELETE`, and `GET` says only whether one is stored. No answer, log line or
 * error holds the name or the value.
 *
 * The checks run in a fixed order, and every one up to the body uses only the
 * URL and the headers, so a refused request is never parsed: no store (404),
 * other site (403), name (400), content type (415, `PUT`), connection (403,
 * `PUT`), body (400, `PUT`).
 */
export function createProviderKeyRoutes({
  providerKeys,
  errorLog,
}: Pick<ServerPorts, "providerKeys" | "errorLog">): ProviderKeyRoutes {
  async function handle(
    request: Request,
    context: RequestContext,
    body: Uint8Array,
    rest: string,
  ): Promise<Response> {
    const { method } = request;
    if (providerKeys === undefined) {
      return refuse(serverErrors.keysNotSupported);
    }
    if (method !== "GET" && method !== "PUT" && method !== "DELETE") {
      return refuse(serverErrors.notFound);
    }
    const otherSite = refuseOtherSite(request);
    if (otherSite !== null) {
      return refuse(otherSite);
    }
    const name = readName(rest);
    if (name === null) {
      return refuse(serverErrors.secretNameRefused);
    }
    return perform(providerKeys, name, request, context, body);
  }

  /** The verb's work, once the request is the page's own and the name is allowed. */
  async function perform(
    store: ProviderKeyStore,
    name: string,
    request: Request,
    context: RequestContext,
    body: Uint8Array,
  ): Promise<Response> {
    if (request.method === "PUT") {
      const put = readPut(request, context, body);
      if (!put.ok) {
        return refuse(put.error);
      }
      return attempt(async () => {
        await store.set(name, put.value);
        return { saved: true };
      });
    }
    if (request.method === "DELETE") {
      return attempt(async () => {
        await store.remove(name);
        return { removed: true };
      });
    }
    return attempt(async () => ({ stored: await store.has(name) }));
  }

  /**
   * Runs a store call. A read-only store gets its fixed 409. Any other failure reaches the error
   * log as it is, with no URL or name around it, and the caller gets a fixed 500.
   */
  async function attempt(run: () => Promise<Record<string, boolean>>): Promise<Response> {
    try {
      return answer(await run());
    } catch (cause) {
      if (cause instanceof ProviderKeysReadOnlyError) {
        return refuse(serverErrors.keysReadOnly);
      }
      errorLog.record(cause);
      return refuse(serverErrors.internal);
    }
  }

  return { handle };
}
