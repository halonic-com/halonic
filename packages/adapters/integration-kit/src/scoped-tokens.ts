import type { TokenStore } from "@halonicjs/ports";
import { IntegrationRefusedError } from "./integration/index.ts";
import type { IntegrationPolicy } from "./policy.ts";

/**
 * The name a token is kept under in the shared store: `i<length>_<name>_<token>`.
 * The length makes it unique: integration and token names are lower-case
 * words joined by `-`, so two integrations can never land on the same stored
 * name, even though the store treats `-` and `_` as the same.
 *
 * @example
 * storedTokenName("google-mail", "refresh"); // "i11_google-mail_refresh"
 */
export function storedTokenName(integration: string, token: string): string {
  return `i${integration.length}_${integration}_${token}`;
}

/** A token store that holds only this integration's declared tokens, under their own names. */
export function scopedTokens(policy: IntegrationPolicy, store: TokenStore): TokenStore {
  const nameOf = (token: string): string => {
    if (!policy.tokens.includes(token)) {
      throw new IntegrationRefusedError(
        "token-not-declared",
        `${policy.name}: the token "${token}" is not in its permission sheet`,
      );
    }
    return storedTokenName(policy.name, token);
  };
  return {
    get: async (token) => store.get(nameOf(token)),
    set: async (token, value) => store.set(nameOf(token), value),
    remove: async (token) => store.remove(nameOf(token)),
  };
}
