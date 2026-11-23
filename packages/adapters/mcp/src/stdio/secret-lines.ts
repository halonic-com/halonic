/**
 * The shortest line of a secret with a line break that is removed on its
 * own. Shorter lines, such as the `AB==` that ends a base64 key, can be
 * ordinary words of error output, and what's left of a key in them is too
 * little to use.
 */
const shortestSecretLine = 8;

/**
 * What to remove from a program's error output for one secret: the secret
 * itself and, when it holds a line break, each of its lines of at least
 * {@link shortestSecretLine} characters, trimmed. The error-output tail
 * keeps lines apart, drops blank ones, trims `\r` and spaces at their end
 * and can drop the first line of a secret, so a secret with a line break,
 * such as a PEM key, isn't always found whole (`mcp.stdio-restart`).
 *
 * @example
 * secretAndItsLines("acme-key-start\r\nacme-key-middle\nend");
 * // ["acme-key-start\r\nacme-key-middle\nend", "acme-key-start", "acme-key-middle"]
 */
export function secretAndItsLines(secret: string): string[] {
  if (!secret.includes("\n")) return [secret];
  const lines = secret
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= shortestSecretLine);
  return [secret, ...lines];
}
