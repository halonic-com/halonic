import { encodeBase64url, encodeUtf8 } from "@halonicjs/std";
import { encodeFormComponent } from "./form-body.ts";

/** How the client proves who it is at the token endpoint: in the form body, or with HTTP Basic (RFC 6749, section 2.3.1). */
export type ClientAuth = "post" | "basic";

/** The OAuth client a sign-in is made with. The secret is a secret; a public client has none. */
export interface OAuthClient {
  readonly clientId: string;
  /** Absent for a public client, which relies on PKCE alone. */
  readonly clientSecret?: string;
  readonly clientAuth: ClientAuth;
}

/** A token or revoke request as the client sends it: the form and the extra headers. */
export interface ClientRequest {
  readonly form: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Adds the client's identity to a request's own fields.
 * - `post`: `client_id` and, when there is a secret, `client_secret` in the form body.
 * - `basic`: with a secret, an `Authorization: Basic` header holding the
 *   form-encoded ID and secret (RFC 6749, section 2.3.1) and no `client_id`
 *   in the body; without one, only `client_id` in the body.
 * The secret never goes in a URL.
 *
 * @param client - the client's ID, secret and how it authenticates
 * @param fields - what the request itself sends, such as `grant_type` and the token
 */
export function withClientAuth(
  client: OAuthClient,
  fields: Readonly<Record<string, string>>,
): ClientRequest {
  const { clientId, clientSecret, clientAuth } = client;
  if (clientSecret === undefined) {
    return { form: { ...fields, client_id: clientId }, headers: {} };
  }
  if (clientAuth === "post") {
    return { form: { ...fields, client_id: clientId, client_secret: clientSecret }, headers: {} };
  }
  return { form: fields, headers: { authorization: basicCredentials(clientId, clientSecret) } };
}

/**
 * The `Authorization: Basic` value: the ID and the secret form-encoded, joined
 * by `:` and written as standard base64 with padding.
 */
function basicCredentials(clientId: string, clientSecret: string): string {
  const credentials = `${encodeFormComponent(clientId)}:${encodeFormComponent(clientSecret)}`;
  return `Basic ${standardBase64(encodeUtf8(credentials))}`;
}

/** Standard base64 (`+`, `/` and `=` padding) from the core's base64url. */
function standardBase64(bytes: Uint8Array): string {
  const text = encodeBase64url(bytes).replaceAll("-", "+").replaceAll("_", "/");
  return text + "=".repeat((4 - (text.length % 4)) % 4);
}
