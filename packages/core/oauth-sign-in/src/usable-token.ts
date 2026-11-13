/** The fewest characters a token may have. A one-character token would make the secret filter remove that character from every answer. */
export const minTokenLength = 16;

/** Visible ASCII only: no space, no line break, nothing a header or a form couldn't carry as it is. */
const visibleAscii = /^[\x21-\x7e]+$/;

/**
 * Whether a token from a token answer is fit to keep and to place: visible
 * ASCII with no spaces or line breaks, and at least {@link minTokenLength}
 * characters. Anything else is refused and nothing is saved.
 *
 * @param value - the `access_token` or `refresh_token` as received
 * @returns true for a token that passes
 */
export function isUsableToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= minTokenLength && visibleAscii.test(value);
}
