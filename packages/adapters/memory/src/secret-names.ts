const namePattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const maxNameLength = 128;

/**
 * The key a secret or token is kept under: upper case, with `-` as `_`, so
 * `serve-password` and `SERVE_PASSWORD` are the same secret, as the port
 * requires.
 *
 * @throws RangeError when the name isn't `^[A-Za-z][A-Za-z0-9_-]*$` or is longer than 128 characters
 */
export function secretKey(name: string): string {
  if (!namePattern.test(name) || name.length > maxNameLength) {
    throw new RangeError(
      `Secret name ${JSON.stringify(name)} must be a letter, then letters, digits, "-" or "_", at most ${maxNameLength} characters.`,
    );
  }
  return name.toUpperCase().replaceAll("-", "_");
}
