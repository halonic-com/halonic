import type { Secrets } from "@halonicjs/ports";
import { secretVariableName } from "./secret-name.ts";

/**
 * Environment variables by name, as `process.env` holds them. Passed in, so
 * the adapter runs anywhere and tests never touch the real environment.
 */
export type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Configured secrets from `HALONIC_SECRET_<NAME>` environment variables, for
 * the CLI and CI runners. `serve-password` reads `HALONIC_SECRET_SERVE_PASSWORD`.
 *
 * It reads no other variable: not the old `STUDIO_SECRET_` prefix, and not a
 * provider's own variable such as `OPENAI_API_KEY`, so a key only reaches
 * Halonic when someone configured it for Halonic.
 */
export class EnvSecrets implements Secrets {
  readonly #environment: Environment;

  /** @param environment - the variables to read, usually `process.env` */
  constructor(environment: Environment) {
    this.#environment = environment;
  }

  /**
   * The variable's value, or `null` when it is unset or empty. An empty value
   * counts as unset, because `HALONIC_SECRET_X=` in a shell or CI file usually
   * means "not configured here", and a later store may still have it.
   *
   * @throws RangeError when the name breaks the secret name rule; the message names the secret, never a value
   */
  async get(name: string): Promise<string | null> {
    const variable = secretVariableName(name);
    // Own properties only, so a polluted `Object.prototype` can't supply a value.
    const value = Object.hasOwn(this.#environment, variable)
      ? this.#environment[variable]
      : undefined;
    if (value === undefined || value === "") {
      return null;
    }
    return value;
  }
}
