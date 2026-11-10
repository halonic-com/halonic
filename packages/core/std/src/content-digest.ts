// The digest the `DefinitionStore` port's write-if-unchanged check compares.
// It lives here, not in `@halonicjs/ports`, because the ports package uses no
// other package and the core has no `TextEncoder`.

import { bytesToHex } from "./hex.ts";
import { encodeUtf8 } from "./utf8.ts";

/**
 * Anything that hashes bytes with SHA-256, such as the `Digest` port. The
 * core has no hash code of its own, so the caller passes one in.
 */
export interface Sha256 {
  /** The 32-byte SHA-256 of the bytes. */
  sha256(data: Uint8Array): Promise<Uint8Array>;
}

/**
 * The digest of a workspace file's text, as `DefinitionStore.write` expects
 * it: `sha256:` and the 64 lowercase hex characters of the SHA-256 of the
 * text's UTF-8 bytes.
 *
 * @example
 * await contentDigest("hello", digest);
 * // "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
 */
export async function contentDigest(content: string, digest: Sha256): Promise<`sha256:${string}`> {
  return `sha256:${bytesToHex(await digest.sha256(encodeUtf8(content)))}`;
}

/**
 * Whether a file's text, or `null` when there is no file, is what a caller
 * expects: the {@link contentDigest} of the text it last read, or `"absent"`
 * for no file. Every store calls this before a write with `expected`.
 */
export async function matchesExpected(
  current: string | null,
  expected: string,
  digest: Sha256,
): Promise<boolean> {
  if (expected === "absent" || current === null) {
    return expected === "absent" && current === null;
  }
  return (await contentDigest(current, digest)) === expected;
}
