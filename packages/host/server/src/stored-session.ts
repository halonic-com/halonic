/** How one session is kept in the `Coordination` port. */

/**
 * What the store keeps for one session: its end time and a fingerprint of the password hash
 * it was started under, so setting the password again ends it.
 */
export interface StoredSession {
  readonly expiresAt: string;
  readonly password: string;
}

/**
 * The first 16 hex characters of the SHA-256 of the password hash. Every `secret set` salts
 * the hash anew, so even the same password set again gives a new fingerprint.
 */
export async function passwordFingerprint(passwordHash: string): Promise<string> {
  return (await sha256Hex(passwordHash)).slice(0, 16);
}

/** A stored session, or `null` when the stored text is not one: the old form was a plain date. */
export function readStoredSession(stored: string): StoredSession | null {
  try {
    const parsed: unknown = JSON.parse(stored);
    const { expiresAt, password } = (parsed ?? {}) as Partial<Record<keyof StoredSession, unknown>>;
    if (typeof expiresAt !== "string" || typeof password !== "string") {
      return null;
    }
    return { expiresAt, password };
  } catch {
    return null;
  }
}

/** The SHA-256 of a text, as 64 hex characters. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

/** Bytes as lower-case hex text. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
