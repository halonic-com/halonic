import type { Digest } from "@halonicjs/ports";
import { bytesToHex, canonicalJson, encodeUtf8 } from "@halonicjs/std";
import type { TrustContent } from "./trust-content.ts";

/**
 * The prefix of a fingerprint in the current scheme. A change to the
 * content or its encoding gets a new prefix, so a fingerprint from an older
 * scheme never matches silently: Halonic asks again and says that it
 * changed what it checks.
 */
export const trustFingerprintPrefix = "hfp1:";

/**
 * The trust fingerprint of a workspace: `hfp1:` and the SHA-256, in hex,
 * of its trust content. The content is written as canonical JSON (keys
 * sorted, arrays kept as arrays, so `["a b"]` and `["a", "b"]` differ),
 * preceded by its length in bytes and a line break, so the encoding marks
 * where the content ends.
 *
 * @param content - the content from `trustContent`
 * @param digest - the port that hashes; the core has no hash code of its own
 * @returns the fingerprint, such as "hfp1:9f86d081…"
 *
 * @example
 * await trustFingerprint(trustContent({ connectors }), digest); // "hfp1:3b1f…"
 */
export async function trustFingerprint(content: TrustContent, digest: Digest): Promise<string> {
  const json = encodeUtf8(canonicalJson(content));
  const length = encodeUtf8(`${json.length}\n`);
  const encoded = new Uint8Array(length.length + json.length);
  encoded.set(length, 0);
  encoded.set(json, length.length);
  return `${trustFingerprintPrefix}${bytesToHex(await digest.sha256(encoded))}`;
}
