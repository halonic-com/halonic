import { EnvSecrets, secretVariablePrefix } from "@halonicjs/adapter-env-secrets";
import type { Secrets } from "@halonicjs/ports";

/**
 * The Worker's secrets: the `HALONIC_SECRET_<NAME>` variables of `env`, which
 * is where Cloudflare puts a Workers secret. The Worker's bindings sit in
 * `env` too, so only own string variables with the prefix are copied: no
 * binding, and no other variable, can ever be read as a secret.
 *
 * @example
 * await workerSecrets(env).get("token-key"); // the configured key, or null
 */
export function workerSecrets(env: object): Secrets {
  const variables: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith(secretVariablePrefix) && typeof value === "string") {
      variables[name] = value;
    }
  }
  return new EnvSecrets(variables);
}
