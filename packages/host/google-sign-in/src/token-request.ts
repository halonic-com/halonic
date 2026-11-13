import { googleTokenEndpoint, type TokenAnswer } from "@halonicjs/google-setup";
import {
  postTokenForm as postOAuthTokenForm,
  tokenRequestTimeoutMs,
} from "@halonicjs/oauth-sign-in";
import type { HttpClient } from "@halonicjs/ports";

/**
 * Sends one form to Google's token endpoint: a refresh. The secrets go in the
 * form body only, redirects are refused, and a request that takes longer than
 * `tokenRequestTimeoutMs` counts as unreachable (see `postTokenForm` in
 * `@halonicjs/oauth-sign-in`).
 *
 * @param http - the server's `HttpClient`
 * @param form - the form fields, secrets included
 * @returns the status and parsed body, or `undefined` when Google couldn't be reached
 */
export function postTokenForm(
  http: HttpClient,
  form: Readonly<Record<string, string>>,
): Promise<TokenAnswer | undefined> {
  return postOAuthTokenForm(
    http,
    googleTokenEndpoint,
    form,
    AbortSignal.timeout(tokenRequestTimeoutMs),
  );
}
