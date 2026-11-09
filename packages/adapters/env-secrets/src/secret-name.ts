/** The name rule of the `Secrets` port. */
const namePattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
const maxNameLength = 128;

/** Every environment variable this package reads starts with this. */
export const secretVariablePrefix = "HALONIC_SECRET_";

/**
 * The environment variable that holds a secret: {@link secretVariablePrefix}
 * and the name in upper case, with `-` as `_`. So `serve-password`,
 * `SERVE_PASSWORD` and `serve_password` all read `HALONIC_SECRET_SERVE_PASSWORD`,
 * as the port requires.
 *
 * @throws RangeError when the name isn't `^[A-Za-z][A-Za-z0-9_-]*$` or is longer than 128 characters
 *
 * @example
 * secretVariableName("serve-password"); // "HALONIC_SECRET_SERVE_PASSWORD"
 */
export function secretVariableName(name: string): string {
  if (name.length > maxNameLength || !namePattern.test(name)) {
    throw new RangeError(
      `Secret name ${JSON.stringify(name)} must be a letter, then letters, digits, "-" or "_", at most ${maxNameLength} characters.`,
    );
  }
  return secretVariablePrefix + name.toUpperCase().replaceAll("-", "_");
}
