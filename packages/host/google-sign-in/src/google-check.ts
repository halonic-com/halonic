import {
  type GoogleCheckAnswer,
  readGoogleCheckAnswer,
  type ServiceCheckOutcome,
  type ServiceResult,
  type ServiceScopes,
  type SetupService,
  serviceScopes,
} from "@halonicjs/google-setup";
import type { Clock, HttpClient } from "@halonicjs/ports";
import { parseJson } from "./json.ts";

/** How long one check may take before it counts as `unreachable`. */
export const googleCheckTimeoutMs = 10_000;

/**
 * Google's shared host for older APIs. Drive's check, for one, goes to
 * `www.googleapis.com/drive/v3/…` although its sheet lists `drive.googleapis.com`.
 */
const sharedApiHost = "www.googleapis.com";

/**
 * Refuses a `googleCheck` URL the access token must not go to. Only the
 * parsed URL is checked, so `https://gmail.googleapis.com.example.com` or
 * `https://x@example.com/` can't pass as Google:
 * - the protocol is `https:`;
 * - the host is one of the service's own `googleApis` hosts, or
 *   `www.googleapis.com`. Any other `*.googleapis.com` host is refused, such
 *   as Cloud Storage's, where anyone can have a bucket (HAL-1226);
 * - there is no user name or password and no port other than the default.
 *
 * The sheet check in the integrations repo already limits the URL to the
 * sheet's `hosts`; this also keeps it on Google's API hosts.
 *
 * @param url - the service's `googleCheck` URL
 * @param service - the service whose check it is
 * @throws RangeError when the URL is refused. The message doesn't quote it.
 */
export function checkGoogleCheckUrl(url: string, service: SetupService): URL {
  const parsed = URL.parse(url);
  const isServiceApi =
    parsed !== null &&
    parsed.protocol === "https:" &&
    isServiceApiHost(parsed.hostname, service) &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.port === "";
  if (!isServiceApi) {
    throw new RangeError(
      "A googleCheck URL is not an https address on one of its service's Google APIs, so it gets no access token.",
    );
  }
  return parsed;
}

/**
 * Whether the host is one of the service's `googleApis` hosts, or Google's
 * shared API host. A listed host counts only when it is itself a Google API
 * host: the format schema refuses a sheet that lists another, but this
 * package takes a `SetupService` from its caller and holds on its own.
 */
function isServiceApiHost(hostname: string, service: SetupService): boolean {
  if (hostname === sharedApiHost) {
    return true;
  }
  return service.googleApis.some(({ api }) => api === hostname && isGoogleApiHost(api));
}

/** Whether the host is a name under `googleapis.com`, such as `gmail.googleapis.com`. */
function isGoogleApiHost(hostname: string): boolean {
  return hostname.endsWith(".googleapis.com");
}

/** What the checks after sign-in need. */
export interface CheckPorts {
  readonly http: HttpClient;
  readonly clock: Clock;
}

/**
 * Checks each service in order (design 3.5 point 3, item 7): a service whose
 * scopes weren't all granted isn't checked; a service without a
 * `googleCheck` is `allowed`; otherwise its check runs with the fresh access
 * token. The checks run one after the other, which keeps the request log in
 * sheet order; there are one or two today.
 *
 * @param services - the ticked services from the pending sign-in
 * @param grantedScopes - the scopes Google granted
 * @param accessToken - the fresh access token. A secret: it goes only into
 *   the `Authorization` header of a check, and never into a result.
 * @param projectId - the setup's project ID, for the "Switch it on" link
 */
export async function checkServices(
  services: readonly SetupService[],
  grantedScopes: readonly string[],
  accessToken: string,
  projectId: string | undefined,
  ports: CheckPorts,
): Promise<ServiceResult[]> {
  const scopes = serviceScopes(services, grantedScopes);
  const results: ServiceResult[] = [];
  for (const [index, service] of services.entries()) {
    const result = await checkService(service, scopes[index], accessToken, projectId, ports.http);
    results.push({ service: service.id, result, checkedAt: ports.clock.now() });
  }
  return results;
}

/** One service's outcome. */
async function checkService(
  service: SetupService,
  scopes: ServiceScopes | undefined,
  accessToken: string,
  projectId: string | undefined,
  http: HttpClient,
): Promise<ServiceCheckOutcome> {
  if (scopes !== undefined && !scopes.granted) {
    return { kind: "scopeNotGranted", missingScopes: scopes.missingScopes };
  }
  if (service.googleCheck === undefined) {
    return { kind: "allowed" };
  }
  const answer = await runGoogleCheck(http, service, service.googleCheck.url, accessToken);
  if (answer === undefined) {
    return { kind: "unreachable" };
  }
  return readGoogleCheckAnswer(answer, service, projectId);
}

/**
 * Sends one check: a `GET` with no body, only the `Authorization` and
 * `Accept` headers, no redirects (a redirect would carry the token to
 * another address) and a 10-second limit.
 *
 * @returns the status and parsed body, or `undefined` when there was no
 *   answer. The `HttpClient`'s error is dropped, never passed on: it can
 *   carry the request, and with it the token.
 * @throws RangeError before any request when the URL is refused
 */
async function runGoogleCheck(
  http: HttpClient,
  service: SetupService,
  url: string,
  accessToken: string,
): Promise<GoogleCheckAnswer | undefined> {
  const checkedUrl = checkGoogleCheckUrl(url, service);
  try {
    const response = await http.fetch(checkedUrl.href, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(googleCheckTimeoutMs),
    });
    return { status: response.status, json: parseJson(await response.text()) };
  } catch {
    return undefined;
  }
}
