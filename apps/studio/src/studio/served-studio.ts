import { MemoryHostSettingsStore } from "@halonicjs/adapter-memory";
import { ServiceRegistry } from "@halonicjs/app";
import { inboxFeature } from "@halonicjs/studio-feature-inbox";
import { InboxRunsService } from "@halonicjs/studio-feature-inbox/api";
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
import { type PageFetch, ServedInboxRuns } from "../runs/served-inbox-runs.ts";
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
  const pageFetch: PageFetch = page.fetch ?? ((path, init) => fetch(path, init));
  const shell = createShell({
    features: [inboxFeature],
    hostServices: [InboxRunsService],
    host,
    platform,
  });
  const services = servedServices(pageFetch);
  shell.services.instantiate(services);
  const load = () => loadServedWorkspace(pageFetch);
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
 * of Halonic that serves it, for now `halonicVersion`. The Inbox reads and answers the served
 * workspace's runs through `fetch`, the page's own (`studio.served-inbox-runs`).
 */
export function servedServices(
  fetch: PageFetch = (path, init) => globalThis.fetch(path, init),
): ServiceRegistry {
  const services = new ServiceRegistry();
  services.provide(hostSettingsStoreKey, new MemoryHostSettingsStore());
  services.provide(HalonicVersionService, halonicVersion);
  services.provide(InboxRunsService, new ServedInboxRuns({ fetch, onFocus: windowFocus }));
  return services;
}

/** Calls `listener` when the page comes to the front, so the Inbox reads again at once. */
function windowFocus(listener: () => void): () => void {
  window.addEventListener("focus", listener);
  return () => window.removeEventListener("focus", listener);
}
