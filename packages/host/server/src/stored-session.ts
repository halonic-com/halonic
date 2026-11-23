/** How one session is kept in the `Coordination` port. */

/**
 * What the store keeps for one session: its end time, a fingerprint of the password hash
 * it was started under, so setting the password again ends it, and the session generation
 * it was started in, so a revoke ends it. A session started while no generation was set
 * has none.
 */
export interface StoredSession {
  readonly expiresAt: string;
  readonly password: string;
  readonly generation?: string;
}

/**
 * Where the store keeps the session generation: a random value that every revoke replaces.
 * It is a value, never a counter, because `Coordination` keeps counters apart from values.
 */
export const sessionGenerationKey = "sessions:generation";

/** A new session generation: 16 random bytes as hex. The order of generations means nothing. */
export function newSessionGeneration(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * The first 16 hex characters of the SHA-256 of the password hash. Every `secret set` salts
 * the hash anew, so even the same password set again gives a new fingerprint.
 */
export async function passwordFingerprint(passwordHash: string): Promise<string> {
  return (await sha256Hex(passwordHash)).slice(0, 16);
}

/**
 * A stored session, or `null` when the stored text is not one: the old form was a plain date,
 * and a generation that isn't text is not one either.
 */
export function readStoredSession(stored: string): StoredSession | null {
  try {
    const parsed: unknown = JSON.parse(stored);
    const { expiresAt, password, generation } = (parsed ?? {}) as Partial<
      Record<keyof StoredSession, unknown>
    >;
    if (typeof expiresAt !== "string" || typeof password !== "string") {
      return null;
    }
    if (generation === undefined) {
      return { expiresAt, password };
    }
    return typeof generation === "string" ? { expiresAt, password, generation } : null;
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
