import { TauriSecrets } from "@halonicjs/adapter-secrets-tauri";
import { type ServiceRegistry, serviceKey } from "@halonicjs/app";
import {
  maxSecretNameLength,
  type Secrets,
  secretKey,
  type TokenStore,
  tokenNamePrefix,
  workspaceSecrets,
} from "@halonicjs/ports";
import { tauriIpc } from "./tauri-ipc.ts";

/** The configured secrets, such as provider API keys. */
export const secretsKey = serviceKey<Secrets>("platform.secrets");

/** The sign-in tokens, such as a Google refresh token. */
export const tokenStoreKey = serviceKey<TokenStore>("platform.tokens");

/** The longest token name that still fits the keychain's name rule once prefixed. */
export const maxShellTokenNameLength = maxSecretNameLength - tokenNamePrefix.length;

/**
 * Gives a workspace's services the OS keychain as their `Secrets` and
 * `TokenStore`, when the Studio runs in the desktop shell. Both use one
 * {@link TauriSecrets} (the keychain service `halonic`), but in separate
 * namespaces: every token is stored under `tokenNamePrefix`, and `Secrets`
 * is the keychain seen through `workspaceSecrets` (both from
 * `@halonicjs/ports`), which refuses that prefix and Halonic's own
 * `token-key` and `serve-password`. So a token can not be read as a secret.
 *
 * Outside the shell it provides nothing and returns `false`, so the caller
 * can provide the browser's or the server's stores instead.
 *
 * @param services - the services of the workspace that is opening
 * @param page - the page's global object, usually `window`
 * @returns whether the keychain was provided
 * @throws ServiceError when either key is already provided
 *
 * @example
 * const scope = openWorkspace({ store, onListenerError });
 * provideShellSecrets(scope.services, window);
 */
export function provideShellSecrets(
  services: Pick<ServiceRegistry, "provide">,
  page: object,
): boolean {
  const ipc = tauriIpc(page);
  if (ipc === undefined) {
    return false;
  }
  const keychain = new TauriSecrets(ipc);
  services.provide(secretsKey, workspaceSecrets(keychain));
  services.provide(tokenStoreKey, prefixedTokens(keychain));
  return true;
}

/**
 * The keychain as a `TokenStore` whose tokens all live under
 * `tokenNamePrefix`.
 *
 * @throws RangeError for a name that breaks the rule, or is longer than
 *   {@link maxShellTokenNameLength}; the message never repeats it
 */
function prefixedTokens(keychain: TokenStore): TokenStore {
  const stored = (name: string): string => {
    secretKey(name);
    if (name.length > maxShellTokenNameLength) {
      throw new RangeError(
        `A token name may be at most ${maxShellTokenNameLength} characters in the desktop keychain.`,
      );
    }
    return tokenNamePrefix + name;
  };
  return {
    get: async (name) => keychain.get(stored(name)),
    set: async (name, value) => keychain.set(stored(name), value),
    remove: async (name) => keychain.remove(stored(name)),
  };
}
