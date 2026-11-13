/** The fewest characters a token may have. A one-character token would make the secret filter remove that character from every answer. */
export const minTokenLength = 16;

/**
 * The most characters a token may have: 4096. Real access tokens, JWTs
 * included, are a few hundred to about two thousand characters, and a server
 * refuses a header much over 8 KiB, so a longer value is no token. The limit
 * keeps a hostile provider from making the host hold and save huge values.
 */
export const maxTokenLength = 4096;

/** Visible ASCII only: no space, no line break, nothing a header or a form couldn't carry as it is. */
const visibleAscii = /^[\x21-\x7e]+$/;

/**
 * Whether a token from a token answer is fit to keep and to place: visible
 * ASCII with no spaces or line breaks, and at least {@link minTokenLength}
 * and at most {@link maxTokenLength} characters. Anything else is refused and nothing is saved.
 *
 * @param value - the `access_token` or `refresh_token` as received
 * @returns true for a token that passes
 */
export function isUsableToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= minTokenLength &&
    value.length <= maxTokenLength &&
    visibleAscii.test(value)
  );
}
