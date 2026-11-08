import type { TokenStore } from "@halonicjs/ports";
import { clientSecretName, stagedClientSecretName } from "./store-names.ts";

/**
 * Reads a client secret back from the `TokenStore`. Only the host's Google
 * sign-in and token refresh use it, to talk to Google; the kit, integrations
 * and hubs never do (plan D1). So it is exported from
 * `@halonicjs/google-setup/host` only.
 */
export interface ClientSecretReader {
  /** The secret in use, or `null` when none is saved. For the sign-in. */
  readClientSecret(clientRef: string): Promise<string | null>;

  /** The staged secret, or `null`. For the token refresh that checks it. */
  readStagedClientSecret(clientRef: string): Promise<string | null>;
}

/**
 * The client secret reader over a `TokenStore`.
 *
 * @param tokens - where `clientSecretStore` keeps the secrets
 *
 * @example
 * const reader = clientSecretReader(tokens);
 * const secret = await reader.readClientSecret(clientRef);
 */
export function clientSecretReader(tokens: TokenStore): ClientSecretReader {
  return {
    async readClientSecret(clientRef) {
      return tokens.get(clientSecretName(clientRef));
    },

    async readStagedClientSecret(clientRef) {
      return tokens.get(stagedClientSecretName(clientRef));
    },
  };
}
