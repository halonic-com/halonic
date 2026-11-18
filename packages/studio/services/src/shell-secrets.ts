import {
  maxTokenNameLength,
  type SecretPresence,
  TauriSecrets,
  TauriTokens,
} from "@halonicjs/adapter-secrets-tauri";
import { type ServiceRegistry, serviceKey } from "@halonicjs/app";
import { type Secrets, type TokenStore, workspaceSecrets } from "@halonicjs/ports";
import { type TauriIpc, tauriIpc } from "./tauri-ipc.ts";

/** The configured secrets, such as provider API keys. */
export const secretsKey = serviceKey<Secrets>("platform.secrets");

/** The sign-in tokens, such as a Google refresh token. */
export const tokenStoreKey = serviceKey<TokenStore>("platform.tokens");

/** The longest token name that still fits the keychain's name rule once prefixed. */
export const maxShellTokenNameLength = maxTokenNameLength;

/**
 * Gives a workspace's services the OS keychain as their `Secrets` and
 * `TokenStore`, when the Studio runs in the desktop shell. Both use the
 * keychain service `halonic`, but in separate namespaces: tokens go through
 * the shell's token commands ({@link TauriTokens}), which keep each one under
 * `tokenNamePrefix`, and `Secrets` is {@link TauriSecrets} seen through
 * `workspaceSecrets` (both from `@halonicjs/ports`), which refuses that prefix
 * and Halonic's own `token-key` and `serve-password`. The shell refuses those
 * names to its secret commands as well, so a token can not be read as a
 * secret, not even by code that calls the commands directly.
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
  services.provide(secretsKey, workspaceSecrets(new TauriSecrets(ipc)));
  services.provide(tokenStoreKey, new TauriTokens(ipc));
  return true;
}

/**
 * The OS keychain (the service `halonic`) as it is, with no name rule beyond the shell's own:
 * the shell refuses Halonic's own names and tokens.
 * `has` asks whether a name is stored without reading it.
 * A caller that lets a workspace pick the name must refuse a plugin's names itself,
 * as `workspaceSecrets` does for reading.
 *
 * @param ipc - the shell's IPC, from `tauriIpc`
 */
export function shellKeychain(ipc: TauriIpc): Secrets & TokenStore & SecretPresence {
  return new TauriSecrets(ipc);
}
