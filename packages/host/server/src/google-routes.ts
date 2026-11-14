import {
  type SetupRecord,
  SetupRecordError,
  savedConnectorState,
  setupSteps,
} from "@halonicjs/google-setup";
import type { GoogleSetupPorts, RequestContext } from "./api.ts";
import { errorResponse, type ServerError, serverErrors } from "./errors.ts";
import { isLoopbackRequest, isSecureConnection } from "./security.ts";

/** Every Google setup route starts with this path. */
export const googlePathPrefix = "/api/google/";

const setupsPrefix = `${googlePathPrefix}setups/`;
const secretSuffix = "/secret";

/** More than any real client secret; it keeps what a request can make the store keep bounded. */
const maxSecretLength = 512;

/**
 * Whether a path is one that takes a client secret. The request log leaves
 * these out, so no log line says when or how often a secret was sent.
 */
export function isSecretPath(pathname: string): boolean {
  return pathname.startsWith(setupsPrefix) && pathname.endsWith(secretSuffix);
}

export interface GoogleRoutes {
  /**
   * Answers a request under `/api/google/`. The caller has already checked
   * the host, the origin, the daily ceiling and the body size, and answers
   * 401 itself when `signedIn` is false.
   */
  handle(request: Request, body: Uint8Array, context: RequestContext): Promise<Response>;
}

/** What the routes need to know about the request besides the request. */
type GoogleRoutePorts = { readonly google: GoogleSetupPorts };

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
 * The checks only the secret routes make, on top of the sign-in and the
 * server's own origin check (design 3.3, and the API key's rules in the
 * models flow): the request is the page's own, it is JSON, and the secret
 * travels over HTTPS or stays on this computer, or the person confirmed
 * plain http.
 */
function refuseSecretRequest(
  request: Request,
  context: RequestContext,
  confirmedPlainHttp: boolean,
): ServerError | null {
  // A browser says where a request comes from; a request with no such header is the Android app or a script.
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") {
    return serverErrors.secretFromOtherSite;
  }
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return serverErrors.secretNeedsJson;
  }
  const safeToSend = isSecureConnection(request, context) || isLoopbackRequest(request);
  return safeToSend || confirmedPlainHttp ? null : serverErrors.secretNeedsSecureConnection;
}

export function createGoogleRoutes({ google }: GoogleRoutePorts): GoogleRoutes {
  const { setups, clientSecrets, source } = google;

  /** The record, or `null` when there is none or the ref isn't one. A damaged record is an error for the caller. */
  async function readSetup(accountRef: string): Promise<SetupRecord | null> {
    try {
      return await setups.read(accountRef);
    } catch (error) {
      if (error instanceof SetupRecordError && error.reason === "not-found") {
        return null;
      }
      throw error;
    }
  }

  /** `GET /api/google/setups/<ref>`: the progress and the steps. Nothing secret is in it, and not even the secret's ref. */
  async function show(accountRef: string): Promise<Response> {
    const record = await readSetup(accountRef);
    const subject = record === null ? null : await source.describe(accountRef);
    if (record === null || subject === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    const steps = setupSteps({
      route: record.route,
      accountType: record.accountType,
      account: subject.account,
      ...(record.projectId === null ? {} : { projectId: record.projectId }),
      services: subject.services,
    });
    return Response.json({
      accountRef,
      accountType: record.accountType,
      startedAt: record.startedAt,
      projectId: record.projectId,
      stepsDone: record.stepsDone,
      inProductionTickedAt: record.inProductionTickedAt,
      clientId: record.clientId,
      clientSecretSavedAt: record.clientSecret?.savedAt ?? null,
      signInStartedAt: record.signInStartedAt,
      lastSignInAt: record.lastSignInAt,
      services: record.services,
      problem: savedConnectorState(record),
      steps,
    });
  }

  /**
   * `PUT /api/google/setups/<ref>/secret`: keeps the first secret of a setup,
   * or replaces it while the account has never signed in, since then there is
   * nothing to break and nothing to test the new secret with. Once the
   * account has signed in, or another account uses the same client, a new
   * secret goes through staging instead, so a wrong one never replaces a
   * working one. Every answer is fixed text: no part of the request or of an
   * error is echoed.
   */
  async function saveSecret(
    request: Request,
    body: Uint8Array,
    context: RequestContext,
    accountRef: string,
  ): Promise<Response> {
    const secretRequest = readSecretRequest(body);
    if (secretRequest === null) {
      return errorResponse(serverErrors.secretNotAccepted);
    }
    const refusal = refuseSecretRequest(request, context, secretRequest.confirmedPlainHttp);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    const record = await readSetup(accountRef);
    if (record === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    if (record.clientSecret === null) {
      const clientRef = await clientSecrets.saveClientSecret(secretRequest.clientSecret);
      await setups.update(accountRef, { kind: "client-secret-saved", clientRef });
      return Response.json({ saved: true });
    }
    const { clientRef } = record.clientSecret;
    const sharedOrSignedIn =
      record.lastSignInAt !== null || (await setups.usingClient(clientRef)).length > 1;
    if (sharedOrSignedIn) {
      return errorResponse(serverErrors.secretNeedsStaging);
    }
    await clientSecrets.replaceClientSecret(clientRef, secretRequest.clientSecret);
    await setups.update(accountRef, { kind: "client-secret-saved", clientRef });
    return Response.json({ saved: true });
  }

  return {
    async handle(request, body, context) {
      const { pathname } = new URL(request.url);
      if (!pathname.startsWith(setupsPrefix)) {
        return errorResponse(serverErrors.notFound);
      }
      const rest = pathname.slice(setupsPrefix.length);
      if (request.method === "GET" && !rest.includes("/")) {
        return show(rest);
      }
      if (request.method === "PUT" && rest.endsWith(secretSuffix)) {
        const accountRef = rest.slice(0, -secretSuffix.length);
        return accountRef.includes("/")
          ? errorResponse(serverErrors.notFound)
          : saveSecret(request, body, context, accountRef);
      }
      return errorResponse(serverErrors.notFound);
    },
  };
}
