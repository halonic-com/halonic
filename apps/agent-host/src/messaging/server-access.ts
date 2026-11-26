import type { AccessToken } from "@halonicjs/host-server";

/** What the keychain holds for a workspace's server: the device token, and the Access service token when one is set. */
export interface KeptPairing {
  readonly token: string;
  readonly access?: AccessToken;
}

/**
 * The keychain value for a pairing. Without an Access service token it is the
 * device token itself, as before; with one it is a JSON object, so both live in
 * the one entry under the workspace's `server-pairing__<key>` name and neither
 * reaches the profile, the workspace file, a log or a page's answer.
 */
export function keptValue({ token, access }: KeptPairing): string {
  return access === undefined
    ? token
    : JSON.stringify({ token, clientId: access.clientId, clientSecret: access.clientSecret });
}

/** The pairing a keychain value holds. A device token only ever holds printable characters, never `{`'s object. */
export function keptPairing(value: string): KeptPairing {
  if (!value.startsWith("{")) return { token: value };
  try {
    const { token, clientId, clientSecret } = JSON.parse(value) as Record<string, unknown>;
    if (typeof token !== "string") return { token: value };
    return typeof clientId === "string" && typeof clientSecret === "string"
      ? { token, access: { clientId, clientSecret } }
      : { token };
  } catch {
    return { token: value };
  }
}
