import { googleTokenEndpoint, type TokenAnswer } from "@halonicjs/google-setup";
import type { HttpClient } from "@halonicjs/ports";
import { parseJson } from "./json.ts";

/**
 * Sends one form to Google's token endpoint: the code exchange or a refresh.
 * The secrets go in the form body only, never in the URL. Redirects are
 * refused, because a 307 or 308 would send the same body, secrets and all,
 * to another address.
 *
 * @param http - the server's `HttpClient`
 * @param form - the form fields, secrets included
 * @returns the status and parsed body, or `undefined` when Google couldn't be
 *   reached. The `HttpClient`'s error is dropped, never passed on: it can
 *   carry the request.
 */
export async function postTokenForm(
  http: HttpClient,
  form: Readonly<Record<string, string>>,
): Promise<TokenAnswer | undefined> {
  try {
    const response = await http.fetch(googleTokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(form).toString(),
      redirect: "error",
    });
    return { status: response.status, json: parseJson(await response.text()) };
  } catch {
    return undefined;
  }
}
