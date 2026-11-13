/** OAuth error codes are short snake_case words, such as `access_denied` (RFC 6749, section 5.2). */
const errorCodePattern = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Keeps an OAuth error code only when it looks like one, and gives
 * `"unrecognised"` otherwise. Error parameters come back through the browser
 * or in the provider's answer, which may echo the request, so a value that
 * isn't a plain code never reaches a result, a message or a log line. The
 * `error_description` is never read at all.
 *
 * @param value - the `error` field as received
 * @returns the code, or `"unrecognised"`
 */
export function safeOAuthErrorCode(value: unknown): string {
  return typeof value === "string" && errorCodePattern.test(value) ? value : "unrecognised";
}
