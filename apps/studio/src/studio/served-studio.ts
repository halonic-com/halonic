import { MemoryHostSettingsStore } from "@halonicjs/adapter-memory";
import { ServiceRegistry } from "@halonicjs/app";
import { HalonicVersionService } from "@halonicjs/studio-feature-settings/api";
import {
  type MountedServedWindow,
  mountServedWindow,
  type ServedWorkspace,
} from "@halonicjs/studio-feature-workspace";
import { hostSettingsStoreKey } from "@halonicjs/studio-services";
import {
  createShell,
  type KeyboardPlatform,
  type StudioHost,
  StudioWorkspace,
} from "@halonicjs/studio-shell";
import { halonicVersion } from "./open-trusts.ts";
import { loadServedWorkspace } from "./served-workspace.ts";
import type { StartedStudio, StudioPage } from "./start-studio.ts";

/** Where the served Studio runs and how its words read. */
interface ServedStudioOptions {
  readonly host: StudioHost;
  readonly platform: KeyboardPlatform;
  readonly language: string;
}

/**
 * The served Studio (`studio.served-workspace`): asks the computer which workspace it serves, then
 * draws its window named after it. Until the answer comes the page keeps its "Starting Halonic…"
 * text; with no answer the window opens anyway, with no workspace name and no workspace row on More.
 */
export function startServedStudio(
  page: StudioPage,
  { host, platform, language }: ServedStudioOptions,
): StartedStudio {
  const shell = createShell({ features: [], host, platform });
  const services = servedServices();
  shell.services.instantiate(services);
  const load = () => loadServedWorkspace(page.fetch ?? ((path) => fetch(path)));
  let window: MountedServedWindow | undefined;
  let workspace: StudioWorkspace | undefined;
  let stopped = false;
  const draw = (served: ServedWorkspace | undefined) => {
    if (stopped) return;
    workspace = new StudioWorkspace({
      toasts: shell.toasts,
      services,
      ...(served === undefined ? {} : { name: served.name }),
    });
    window = mountServedWindow(page.element, {
      shell,
      workspace,
      host,
      platform,
      language,
      served,
      load,
    });
  };
  load().then(draw, () => draw(undefined));
  return {
    host,
    stop: async () => {
      stopped = true;
      window?.unmount();
      workspace?.dispose();
      await services.dispose();
    },
  };
}

/**
 * The served Studio's services. Without the shell it can't reach the profile, so its host
 * settings are kept in memory, as in the browser demo, until `halonic serve` gives it the
 * server's (HAL-6159 design, section 5). They last until the page is closed. It shows the version
 * of Halonic that serves it, for now `halonicVersion`.
 */
export function servedServices(): ServiceRegistry {
  const services = new ServiceRegistry();
  services.provide(hostSettingsStoreKey, new MemoryHostSettingsStore());
  services.provide(HalonicVersionService, halonicVersion);
  return services;
}
