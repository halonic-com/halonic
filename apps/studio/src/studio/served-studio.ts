import { MemoryHostSettingsStore } from "@halonicjs/adapter-memory";
import { HostSettings, ServiceRegistry } from "@halonicjs/app";
import { inboxFeature } from "@halonicjs/studio-feature-inbox";
import { InboxRunsService } from "@halonicjs/studio-feature-inbox/api";
import {
  type DisplaySettings,
  settingsFeature,
  watchAppearance,
} from "@halonicjs/studio-feature-settings";
import {
  DisplaySettingsService,
  HalonicVersionService,
  HostSettingsService,
} from "@halonicjs/studio-feature-settings/api";
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
  /** The page's Appearance and Formats, kept in its storage, as the desktop app keeps them. */
  readonly display: DisplaySettings;
}

/**
 * The served Studio (`studio.served-workspace`): asks the computer which workspace it serves, then
 * draws its window named after it. Until the answer comes the page keeps its "Starting Halonic…"
 * text; with no answer the window opens anyway, with no workspace name and no workspace row on More.
 * Its Settings has only the sections this browser keeps, Appearance and Formats
 * (`studio.served-settings`), until the page has the computer's host settings.
 */
export function startServedStudio(
  page: StudioPage,
  { host, platform, language, display }: ServedStudioOptions,
): StartedStudio {
  const pageFetch: PageFetch = page.fetch ?? ((path, init) => fetch(path, init));
  const shell = createShell({
    features: [inboxFeature, settingsFeature],
    hostServices: [InboxRunsService, DisplaySettingsService, HostSettingsService],
    host,
    platform,
  });
  const stopAppearance = watchAppearance(display, page.element.ownerDocument.documentElement);
  const services = servedServices(pageFetch, windowFocus(page.window));
  services.provide(DisplaySettingsService, display);
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
      withoutHostSettings: true,
    });
  };
  load().then(draw, () => draw(undefined));
  return {
    host,
    stop: async () => {
      stopped = true;
      stopAppearance();
      window?.unmount();
      workspace?.dispose();
      await services.dispose();
    },
  };
}

/**
 * The served Studio's services. Without the shell it can't reach the profile, so its host
 * settings are kept in memory, as in the browser demo, until `halonic serve` gives it the
 * server's (HAL-6159 design, section 5). They last until the page is closed, and nothing reads
 * them yet: the window leaves out the host sections of Settings until then. It shows the version
 * of Halonic that serves it, for now `halonicVersion`. The Inbox reads and answers the served
 * workspace's runs through `fetch`, the page's own (`studio.served-inbox-runs`).
 */
export function servedServices(
  fetch: PageFetch = (path, init) => globalThis.fetch(path, init),
  onFocus?: (listener: () => void) => () => void,
): ServiceRegistry {
  const services = new ServiceRegistry();
  const hostSettings = new MemoryHostSettingsStore();
  services.provide(hostSettingsStoreKey, hostSettings);
  services.provide(HostSettingsService, new HostSettings(hostSettings));
  services.provide(HalonicVersionService, halonicVersion);
  services.provide(
    InboxRunsService,
    new ServedInboxRuns({ fetch, ...(onFocus === undefined ? {} : { onFocus }) }),
  );
  return services;
}

/** Calls `listener` when the page's window comes to the front, so the Inbox reads again at once. */
function windowFocus(page: object): (listener: () => void) => () => void {
  const target = page as Pick<Window, "addEventListener" | "removeEventListener">;
  return (listener) => {
    target.addEventListener("focus", listener);
    return () => target.removeEventListener("focus", listener);
  };
}
