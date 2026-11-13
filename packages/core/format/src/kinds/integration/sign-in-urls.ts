import { type IntegrationSignInUrl, SIGN_IN_URL_PATTERN } from "./schema.ts";

/**
 * Query parameters of an `authorizeUrl` that Halonic sets itself. A sheet
 * that sets one is refused, so a sign-in can't pick its own `redirect_uri`,
 * `state` or PKCE challenge.
 */
export const RESERVED_AUTHORIZE_PARAMETERS: readonly string[] = [
  "client_id",
  "redirect_uri",
  "state",
  "code_challenge",
  "code_challenge_method",
  "response_type",
  "response_mode",
  "request",
  "request_uri",
  "scope",
];

/** The pieces of a fixed sign-in URL, or `undefined` for the `{ fromSetting }` form. */
export function fixedSignInUrl(
  url: IntegrationSignInUrl,
): { readonly host: string; readonly query: string } | undefined {
  if (typeof url !== "string") {
    return undefined;
  }
  const host = SIGN_IN_URL_PATTERN.exec(url)?.[1] ?? "";
  const queryStart = url.indexOf("?");
  return { host, query: queryStart === -1 ? "" : url.slice(queryStart + 1) };
}

/**
 * The names a query string sets, lower-cased and percent-decoded, so
 * `%63lient_id` and `Client_ID` count as `client_id`. A name that isn't valid
 * percent-encoding is returned as written: it can't be a reserved name, and
 * the service would not read it as one either.
 */
export function queryParameterNames(query: string): string[] {
  return query
    .split("&")
    .filter((pair) => pair !== "")
    .map((pair) => {
      const name = pair.split("=")[0]?.replaceAll("+", " ") ?? "";
      try {
        return decodeURIComponent(name).toLowerCase();
      } catch {
        return name.toLowerCase();
      }
    });
}
