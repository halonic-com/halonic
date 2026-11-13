import type { HttpClient } from "@halonicjs/ports";
import { formBody } from "./form-body.ts";
import { parseJson } from "./json.ts";
import type { TokenAnswer } from "./token-answer.ts";

/** The longest the token endpoint, or the revoke endpoint, gets to answer. */
export const tokenRequestTimeoutMs = 10_000;

/**
 * Sends one form to a token endpoint: the code exchange or a refresh.
 * The secrets go in the form body only, never in the URL. Redirects are
 * refused, because a 307 or 308 would send the same body, secrets and all,
 * to another address. A request that is aborted, for taking longer than
 * `tokenRequestTimeoutMs`, counts as unreachable.
 *
 * @param http - the server's `HttpClient`
 * @param tokenEndpoint - the provider's token endpoint, from the sign-in's own settings and never from a callback
 * @param form - the form fields, secrets included
 * @param signal - aborts the request: the caller makes it, as the core has no timers, with `tokenRequestTimeoutMs` as its limit
 * @param headers - extra headers, such as the `Authorization` of a client that authenticates with HTTP Basic
 * @returns the status and parsed body, or `undefined` when the provider couldn't be
 *   reached. The `HttpClient`'s error is dropped, never passed on: it can
 *   carry the request.
 */
export async function postTokenForm(
  http: HttpClient,
  tokenEndpoint: string,
  form: Readonly<Record<string, string>>,
  signal: AbortSignal,
  headers: Readonly<Record<string, string>> = {},
): Promise<TokenAnswer | undefined> {
  try {
    const response = await http.fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        ...headers,
      },
      body: formBody(form),
      redirect: "error",
      signal,
    });
    return { status: response.status, json: parseJson(await response.text()) };
  } catch {
    return undefined;
  }
}
