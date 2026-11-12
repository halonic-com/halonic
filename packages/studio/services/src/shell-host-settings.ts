import { TauriHostSettingsStore } from "@halonicjs/adapter-fs-tauri";
import { type ServiceRegistry, serviceKey } from "@halonicjs/app";
import type { HostSettingsStore } from "@halonicjs/ports";
import { tauriIpc } from "./tauri-ipc.ts";

/** The settings kept where Halonic runs: the assistant and the sandbox default. */
export const hostSettingsStoreKey = serviceKey<HostSettingsStore>("platform.host-settings");

/**
 * Gives a workspace's services the settings kept where Halonic runs, when
 * the Studio runs in the desktop shell: a `TauriHostSettingsStore`, which
 * keeps them through the shell in the CLI's profile, `settings/host.json`,
 * so the CLI and every window read and save the same ones.
 *
 * Outside the shell it provides nothing and returns `false`, so the caller
 * can provide the server's or an in-memory store instead.
 *
 * @param services - the services of the workspace that is opening
 * @param page - the page's global object, usually `window`
 * @returns whether the store was provided
 * @throws ServiceError when the key is already provided
 *
 * @example
 * const services = new ServiceRegistry();
 * provideShellHostSettings(services, window);
 * await services.get(hostSettingsStoreKey).read(); // { "assistant.turn-limit": 20 }
 */
export function provideShellHostSettings(
  services: Pick<ServiceRegistry, "provide">,
  page: object,
): boolean {
  const ipc = tauriIpc(page);
  if (ipc === undefined) {
    return false;
  }
  services.provide(hostSettingsStoreKey, new TauriHostSettingsStore(ipc));
  return true;
}
