import type { RequestContext } from "./api.ts";
import { type ServerError, serverErrors } from "./errors.ts";
import { isLoopbackRequest, isSecureConnection } from "./security.ts";

/** More than any real client secret; it keeps what a request can make the store keep bounded. */
const maxSecretLength = 512;

/** What a request to save a secret says, once it is checked. */
interface SecretRequest {
  readonly clientSecret: string;
  readonly confirmedPlainHttp: boolean;
}

/**
 * Reads the secret request. A bad body is never described: a parse error can
 * quote the text it choked on, and that text can be the secret. So the cause
 * is dropped and the caller gets `null`.
 */
function readSecretRequest(body: Uint8Array): SecretRequest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const { clientSecret, confirmedPlainHttp } = parsed as Record<string, unknown>;
  if (typeof clientSecret !== "string" || clientSecret.trim() === "") {
    return null;
  }
  if (clientSecret.length > maxSecretLength) {
    return null;
  }
  if (confirmedPlainHttp !== undefined && typeof confirmedPlainHttp !== "boolean") {
    return null;
  }
  return { clientSecret, confirmedPlainHttp: confirmedPlainHttp === true };
}

/**
 * Refuses a request a browser says comes from another site. A request with no
 * such header is the Android app or a script, and passes.
 */
export function refuseOtherSite(request: Request): ServerError | null {
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" ? null : serverErrors.secretFromOtherSite;
}

/** Refuses a body that doesn't say it is JSON. */
function refuseNonJson(request: Request): ServerError | null {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return contentType === "application/json" ? null : serverErrors.secretNeedsJson;
}

/**
 * The secret travels over HTTPS or stays on this computer, or the person
 * confirmed plain http. This needs `confirmedPlainHttp`, so it runs after the
 * body is parsed.
 */
function refuseInsecureConnection(
  request: Request,
  context: RequestContext,
  confirmedPlainHttp: boolean,
): ServerError | null {
  const safeToSend = isSecureConnection(request, context) || isLoopbackRequest(request);
  return safeToSend || confirmedPlainHttp ? null : serverErrors.secretNeedsSecureConnection;
}

/** A secret request that passed every check, or the fixed error to answer with. */
export type CheckedSecret =
  | { readonly ok: true; readonly clientSecret: string }
  | { readonly ok: false; readonly error: ServerError };

/**
 * The checks every route that takes a client secret makes (design 3.3, and
 * the API key's rules in the models flow), on top of the sign-in and the
 * server's own origin check. The headers come first and the body second:
 * the request must be the page's own and say it is JSON before the body is
 * parsed. Every refusal is a fixed error; nothing of the request is echoed.
 */
export function checkSecretRequest(
  request: Request,
  body: Uint8Array,
  context: RequestContext,
): CheckedSecret {
  const headerRefusal = refuseOtherSite(request) ?? refuseNonJson(request);
  if (headerRefusal !== null) {
    return { ok: false, error: headerRefusal };
  }
  const secretRequest = readSecretRequest(body);
  if (secretRequest === null) {
    return { ok: false, error: serverErrors.secretNotAccepted };
  }
  const connectionRefusal = refuseInsecureConnection(
    request,
    context,
    secretRequest.confirmedPlainHttp,
  );
  if (connectionRefusal !== null) {
    return { ok: false, error: connectionRefusal };
  }
  return { ok: true, clientSecret: secretRequest.clientSecret };
}
