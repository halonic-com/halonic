import { MemoryHostSettingsStore } from "@halonicjs/adapter-memory";
import { HostSettings, ServiceRegistry } from "@halonicjs/app";
import { accountMenuFeature } from "@halonicjs/studio-feature-account-menu";
import { AccountMenuHostService } from "@halonicjs/studio-feature-account-menu/api";
import { servedFirstRunFeature } from "@halonicjs/studio-feature-first-run";
import { ModelChoiceHostService } from "@halonicjs/studio-feature-first-run/api";
import { servedGoogleSetupFeature } from "@halonicjs/studio-feature-google-setup";
import { GoogleSetupAccountsService } from "@halonicjs/studio-feature-google-setup/api";
import { inboxFeature } from "@halonicjs/studio-feature-inbox";
import { InboxRunsService, ServedHomeHintService } from "@halonicjs/studio-feature-inbox/api";
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
import { ServedAccountMenu } from "../account/served-account-menu.ts";
import { ServedGoogleSetupAccounts } from "../google/served-google-setup-accounts.ts";
import { ServedModelChoice } from "../models/served-model-choice.ts";
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
 * Its Settings has the sections this browser keeps, Appearance and Formats, and no host section
 * (`studio.served-settings`) until the page has the computer's host settings, plus the
 * workspace's Models, whose Model row opens Pick a model on the computer's model choice
 * (`studio.served-model-choice`). With many users and a Cloud session, the title bar has the
 * customer's account menu (`studio.served-account-menu`). Home's Needs you learns whether the
 * workspace is the sample, for its next step (`inbox.home-next-step`).
 */
export function startServedStudio(
  page: StudioPage,
  { host, platform, language, display }: ServedStudioOptions,
): StartedStudio {
  const pageFetch: PageFetch = page.fetch ?? ((path, init) => fetch(path, init));
  const shell = createShell({
    features: [
      inboxFeature,
      settingsFeature,
      servedGoogleSetupFeature,
      servedFirstRunFeature,
      accountMenuFeature,
    ],
    hostServices: [
      InboxRunsService,
      ServedHomeHintService,
      DisplaySettingsService,
      HostSettingsService,
      GoogleSetupAccountsService,
      ModelChoiceHostService,
      AccountMenuHostService,
    ],
    host,
    platform,
  });
  const stopAppearance = watchAppearance(display, page.element.ownerDocument.documentElement);
  const services = servedServices(pageFetch, windowFocus(page.window));
  services.provide(
    AccountMenuHostService,
    new ServedAccountMenu(pageFetch, pageOpener(page.window)),
  );
  services.provide(DisplaySettingsService, display);
  // The window is drawn once the computer said which workspace it serves, so Home reads it set.
  let sample = false;
  services.provide(ServedHomeHintService, { isDemo: () => sample });
  shell.services.instantiate(services);
  const load = () => loadServedWorkspace(pageFetch);
  let window: MountedServedWindow | undefined;
  let workspace: StudioWorkspace | undefined;
  let stopped = false;
  const draw = (served: ServedWorkspace | undefined) => {
    if (stopped) return;
    sample = served?.sample === true;
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
 * workspace's runs through `fetch`, the page's own (`studio.served-inbox-runs`), and lists the
 * Google setups the computer lets it read (`studio.served-google-setup-accounts`). Pick a model
 * tests and saves through the computer's model choice (`studio.served-model-choice`).
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
  services.provide(GoogleSetupAccountsService, new ServedGoogleSetupAccounts(fetch, onFocus));
  services.provide(ModelChoiceHostService, new ServedModelChoice(fetch));
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

/** Opens an address in the page's own tab, as the account menu's links do. */
function pageOpener(page: object): (address: string) => void {
  const target = page as Pick<Window, "location">;
  return (address) => target.location.assign(address);
}
