import type { Digest } from "@halonicjs/ports";
import { bytesToHex, canonicalJson, encodeUtf8 } from "@halonicjs/std";
import type { ClientAuth } from "./client-auth.ts";

/**
 * The sign-in the user approved, with every setting filled in: what Halonic
 * shows in the trust check, resolved from the sheet and the integration's
 * settings. It is saved with the refresh token, so that refresh and revoke
 * use what the user approved and never a sheet loaded later.
 *
 * It holds no secret: `clientSecretName` is the name of the client secret in
 * the secret store, not its value.
 */
export interface ApprovedSignIn {
  readonly flow: "oauth-code";
  /** With the extra query parameters the sheet gives it. */
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  /** Where to revoke, when the sheet declares it. */
  readonly revokeUrl?: string;
  /**
   * The server's revoke ends every token of the client and user, so revoking
   * the old grant of a new sign-in under the same client would end the new
   * one. Left out when the sheet doesn't say so, which keeps the hash of
   * every grant saved before this key existed.
   */
  readonly revokeEndsClientGrants?: true;
  readonly issuer?: string;
  readonly clientId: string;
  readonly clientAuth: ClientAuth;
  /** Absent for a public client, which relies on PKCE alone. */
  readonly clientSecretName?: string;
  readonly scopes: readonly string[];
  /** The hosts the access token may go to. */
  readonly accessHosts: readonly string[];
  readonly as: "bearer" | "header";
  readonly header?: string;
  readonly prefix?: string;
}

/**
 * A fingerprint of an approved sign-in: `sha256:` and 64 lower-case hex
 * characters. It covers the resolved values, not the sheet's text, so a
 * changed setting changes it and a reworded purpose doesn't. The order of
 * scopes and of hosts doesn't matter.
 */
export type ApprovedSignInHash = `sha256:${string}`;

/**
 * Fingerprints an approved sign-in.
 *
 * @param signIn - the approved, resolved sign-in
 * @param digest - the platform's SHA-256
 * @returns the hash to save with the grant and to compare on every load
 *
 * @example
 * await approvedSignInHash(approved, digest); // "sha256:9f86d0…"
 */
export async function approvedSignInHash(
  signIn: ApprovedSignIn,
  digest: Digest,
): Promise<ApprovedSignInHash> {
  const canonical = canonicalJson({
    ...signIn,
    scopes: [...signIn.scopes].sort(),
    accessHosts: [...signIn.accessHosts].sort(),
  });
  return `sha256:${bytesToHex(await digest.sha256(encodeUtf8(canonical)))}`;
}

/**
 * Whether revoking `old` at its server would also end a grant approved as
 * `next`: `old` says its revoke ends every token of a client, and both use
 * the same client at the same token and revoke servers.
 */
export function revokeWouldEndGrantOf(old: ApprovedSignIn, next: ApprovedSignIn): boolean {
  return (
    old.revokeEndsClientGrants === true &&
    old.clientId === next.clientId &&
    originOf(old.tokenUrl) === originOf(next.tokenUrl) &&
    old.revokeUrl !== undefined &&
    next.revokeUrl !== undefined &&
    originOf(old.revokeUrl) === originOf(next.revokeUrl)
  );
}

/** `https://host` of an approved URL, which is always absolute and already normalised; a core package has no `URL`. */
function originOf(url: string): string {
  return url.split("/").slice(0, 3).join("/");
}
