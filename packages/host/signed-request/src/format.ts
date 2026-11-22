// The signed-request format a deployment and Halonic Cloud use to talk to
// each other. One format for both directions; each direction has its own keys,
// and the direction is part of what is signed, so a request signed for one
// direction never verifies in the other.

import { encodeBase64url, encodeUtf8 } from "@halonicjs/std";

/** Which way a request goes. Part of the signed message. */
export type Direction = "cloud-to-deployment" | "deployment-to-cloud";

/** The headers a signed request carries. Header names are case-insensitive. */
export const signedRequestHeaders = {
  /** The id of the key that signed the request. */
  keyId: "halonic-signature-key",
  /** When the request was signed, in whole seconds since 1970 (UTC). */
  timestamp: "halonic-signature-timestamp",
  /** 16 random bytes in base64url, never used twice within the time window. */
  nonce: "halonic-signature-nonce",
  /** The Ed25519 signature over the signed message, in base64url. */
  signature: "halonic-signature",
  /** The customer (end user) the request is about, when there is one. */
  endUser: "halonic-end-user",
  /** The command's id, when the request is a command; repeating it repeats nothing. */
  commandId: "halonic-command-id",
} as const;

/** How far a request's timestamp may be from the receiver's clock, either way. */
export const timeWindowSeconds = 5 * 60;

/** The number of random bytes in a nonce. */
export const nonceByteCount = 16;

/** The first entry of every signed message, so a later format can't be mistaken for this one. */
const formatLabel = "halonic-signed-request-v1";

/** Everything a signature covers. */
export interface SignedFields {
  readonly direction: Direction;
  readonly keyId: string;
  /** The HTTP method, upper case. */
  readonly method: string;
  /** The host the request is sent to, lower case, with the port if the URL has one. */
  readonly host: string;
  /** The path with the query string, exactly as sent. */
  readonly pathAndQuery: string;
  /** The product the key belongs to. Never read from the request: the receiver knows it from the key. */
  readonly product: string;
  readonly endUser: string | undefined;
  readonly commandId: string | undefined;
  readonly timestamp: string;
  readonly nonce: string;
  /** SHA-256 of the body's bytes, in base64url. An empty body is hashed too. */
  readonly bodyHash: string;
}

/**
 * The bytes that are signed: the fields as a JSON array in a fixed order.
 * A JSON array has one reading only, so no field can spill into the next.
 *
 * @param fields - what the signature covers
 * @returns the UTF-8 bytes of the message
 */
export function signedMessage(fields: SignedFields): Uint8Array<ArrayBuffer> {
  // Copied into its own buffer, as WebCrypto wants.
  return Uint8Array.from(
    encodeUtf8(
      JSON.stringify([
        formatLabel,
        fields.direction,
        fields.keyId,
        fields.method,
        fields.host,
        fields.pathAndQuery,
        fields.product,
        fields.endUser ?? "",
        fields.commandId ?? "",
        fields.timestamp,
        fields.nonce,
        fields.bodyHash,
      ]),
    ),
  );
}

/**
 * The SHA-256 of a request body, in base64url.
 *
 * @param body - the body's bytes, empty for a request without a body
 * @returns 43 base64url characters
 */
export async function bodyHash(body: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(body));
  return encodeBase64url(new Uint8Array(digest));
}

/** The host and the path with its query, as the signature covers them. */
export function requestTarget(url: URL): { host: string; pathAndQuery: string } {
  return { host: url.host.toLowerCase(), pathAndQuery: `${url.pathname}${url.search}` };
}

// What each header may hold. Anything else is refused before any key is looked up.
export const headerPatterns = {
  keyId: /^[A-Za-z0-9_.-]{1,64}$/,
  timestamp: /^[0-9]{1,12}$/,
  nonce: /^[A-Za-z0-9_-]{22}$/,
  signature: /^[A-Za-z0-9_-]{86}$/,
  // A customer may be a scope such as `o/<orgId>`, hence the `/`.
  endUser: /^[A-Za-z0-9_.:/-]{1,128}$/,
  commandId: /^[A-Za-z0-9_.:-]{1,128}$/,
} as const;
