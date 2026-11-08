import type { IdGenerator, TokenStore } from "@halonicjs/ports";
import { ClientSecretError } from "./client-secret-error.ts";
import { clientRefPrefix, clientSecretName, stagedClientSecretName } from "./store-names.ts";

/** What `removeClientSecret` did. */
export type ClientSecretRemoval = "removed" | "kept-for-other-accounts";

/**
 * The Google OAuth client secret of an own app, kept in the `TokenStore`
 * (plan D1) under a random client ref, never under an e-mail address or a
 * client ID (plan D2).
 *
 * No call returns a secret except the two reads, which the sign-in and the
 * secret check use to talk to Google. Errors never hold a secret.
 */
export interface ClientSecretStore {
  /**
   * Saves a new client secret, with the spaces around it trimmed.
   *
   * @returns the new client ref, for the setup record
   * @throws ClientSecretError `empty` for an empty value
   */
  saveClientSecret(value: string): Promise<string>;

  /**
   * Replaces the saved secret straight away. Only for a setup that hasn't
   * signed in yet, which has nothing to break and nothing to test the new
   * secret with (design 4.3). Drops a staged secret, which is now out of date.
   *
   * @throws ClientSecretError `empty` or `not-saved`
   */
  replaceClientSecret(clientRef: string, value: string): Promise<void>;

  /**
   * Keeps a new secret apart from the one in use until Google accepts it.
   * The secret in use doesn't change. A second call replaces the staged one.
   *
   * @throws ClientSecretError `empty` or `not-saved`
   */
  stageClientSecret(clientRef: string, value: string): Promise<void>;

  /**
   * Swaps the staged secret in, after Google accepted it.
   *
   * @throws ClientSecretError `nothing-staged`
   */
  promote(clientRef: string): Promise<void>;

  /** Drops the staged secret, after Google refused it. The secret in use stays. */
  discard(clientRef: string): Promise<void>;

  /**
   * Removes the secret and any staged one, unless another Google account uses
   * the same client (design 4.4). Which accounts use a ref is in the setup
   * records, so the caller says.
   */
  removeClientSecret(
    clientRef: string,
    options: { readonly usedByOthers: boolean },
  ): Promise<ClientSecretRemoval>;

  /** The secret in use, or `null` when none is saved. For the sign-in only. */
  readClientSecret(clientRef: string): Promise<string | null>;

  /** The staged secret, or `null`. For the token refresh that checks it only. */
  readStagedClientSecret(clientRef: string): Promise<string | null>;
}

/**
 * The client secret store over a `TokenStore`.
 *
 * @param tokens - where the secrets are kept, encrypted
 * @param ids - makes the client refs
 *
 * @example
 * const secrets = clientSecretStore(tokens, ids);
 * const clientRef = await secrets.saveClientSecret(pasted);
 * await secrets.stageClientSecret(clientRef, pastedAgain);
 * await secrets.promote(clientRef); // once Google accepted it
 */
export function clientSecretStore(tokens: TokenStore, ids: IdGenerator): ClientSecretStore {
  const requireSaved = async (clientRef: string): Promise<void> => {
    if ((await tokens.get(clientSecretName(clientRef))) === null) {
      throw new ClientSecretError("not-saved");
    }
  };

  return {
    async saveClientSecret(value) {
      const secret = trimmedSecret(value);
      const clientRef = ids.next(clientRefPrefix);
      await tokens.set(clientSecretName(clientRef), secret);
      return clientRef;
    },

    async replaceClientSecret(clientRef, value) {
      const secret = trimmedSecret(value);
      await requireSaved(clientRef);
      // In this order, a crash in between loses only the stale staged copy;
      // the other order could leave it for a later promote to swap back in.
      await tokens.remove(stagedClientSecretName(clientRef));
      await tokens.set(clientSecretName(clientRef), secret);
    },

    async stageClientSecret(clientRef, value) {
      const secret = trimmedSecret(value);
      await requireSaved(clientRef);
      await tokens.set(stagedClientSecretName(clientRef), secret);
    },

    async promote(clientRef) {
      const staged = await tokens.get(stagedClientSecretName(clientRef));
      if (staged === null) {
        throw new ClientSecretError("nothing-staged");
      }
      // In this order, a crash in between leaves the staged copy equal to the
      // secret in use, which is harmless; the other order could lose it.
      await tokens.set(clientSecretName(clientRef), staged);
      await tokens.remove(stagedClientSecretName(clientRef));
    },

    async discard(clientRef) {
      await tokens.remove(stagedClientSecretName(clientRef));
    },

    async removeClientSecret(clientRef, { usedByOthers }) {
      // Checks the ref even when nothing is removed, so a bad ref is never silent.
      const names = [clientSecretName(clientRef), stagedClientSecretName(clientRef)];
      if (usedByOthers) {
        return "kept-for-other-accounts";
      }
      for (const name of names) {
        await tokens.remove(name);
      }
      return "removed";
    },

    async readClientSecret(clientRef) {
      return tokens.get(clientSecretName(clientRef));
    },

    async readStagedClientSecret(clientRef) {
      return tokens.get(stagedClientSecretName(clientRef));
    },
  };
}

/** The value with the spaces of a paste trimmed, refused when nothing is left. */
function trimmedSecret(value: string): string {
  const secret = value.trim();
  if (secret === "") {
    throw new ClientSecretError("empty");
  }
  return secret;
}
