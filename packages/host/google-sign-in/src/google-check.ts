import {
  type GoogleCheckAnswer,
  isApiHost,
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
 * Hosts that never count as a service's own API, even when its sheet lists
 * them: Cloud Storage's, where anyone can have a bucket (HAL-1226), and the
 * shared host, which serves many APIs and so needs the path rule.
 */
const neverServiceApiHosts: ReadonlySet<string> = new Set([
  "storage.googleapis.com",
  sharedApiHost,
]);

/**
 * Refuses a `googleCheck` URL the access token must not go to. Only the
 * parsed URL is checked, so `https://gmail.googleapis.com.example.com` or
 * `https://x@example.com/` can't pass as Google:
 * - the protocol is `https:`;
 * - the host is one of the service's own API hosts: a `googleApis` entry
 *   that is a Google API host (`<name>.googleapis.com`), other than Cloud
 *   Storage's. A sheet that lists `evil.example.com` or `googleapis.com`
 *   gives it nothing (HAL-1351);
 * - or the host is `www.googleapis.com` and the path starts with the name
 *   of one of those APIs, such as `/drive/` for `drive.googleapis.com`, so
 *   the shared host can't reach another API, such as `/storage/v1/…`;
 * - there is no user name or password and no port other than the default.
 *
 * The sheet check in the integrations repo already limits the URL to the
 * sheet's `hosts`; this also keeps it on the service's Google APIs.
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
    isOnServiceApi(parsed, service) &&
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
 * Whether the URL is on one of the service's own APIs: on its host, or on
 * the shared host under the API's name.
 */
function isOnServiceApi(url: URL, service: SetupService): boolean {
  const apiHosts = serviceApiHosts(service);
  if (url.hostname === sharedApiHost) {
    const firstPathSegment = url.pathname.split("/")[1];
    return apiHosts.some((api) => apiName(api) === firstPathSegment);
  }
  return apiHosts.includes(url.hostname);
}

/** The service's `googleApis` hosts that are Google API hosts and may get a check. */
function serviceApiHosts(service: SetupService): string[] {
  return service.googleApis
    .map(({ api }) => api)
    .filter((api) => isApiHost(api) && !neverServiceApiHosts.has(api));
}

/** An API host's first label, such as `drive` for `drive.googleapis.com`. */
function apiName(apiHost: string): string {
  return apiHost.slice(0, apiHost.indexOf("."));
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
