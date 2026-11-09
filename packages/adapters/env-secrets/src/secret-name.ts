import { secretKey } from "@halonicjs/ports";

/** Every environment variable this package reads starts with this. */
export const secretVariablePrefix = "HALONIC_SECRET_";

/**
 * The environment variable that holds a secret: {@link secretVariablePrefix}
 * and the name in upper case, with `-` as `_`. So `serve-password`,
 * `SERVE_PASSWORD` and `serve_password` all read `HALONIC_SECRET_SERVE_PASSWORD`,
 * as the port requires.
 *
 * @throws RangeError when the name breaks the rule of the `Secrets` port
 *
 * @example
 * secretVariableName("serve-password"); // "HALONIC_SECRET_SERVE_PASSWORD"
 */
export function secretVariableName(name: string): string {
  return secretVariablePrefix + secretKey(name);
}
