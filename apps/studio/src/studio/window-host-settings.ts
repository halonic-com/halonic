import { MemoryHostSettingsStore } from "@halonicjs/adapter-memory";
import { HostSettings, type ServiceRegistry } from "@halonicjs/app";
import { hostSettingsStoreKey } from "@halonicjs/studio-services";

/** The host settings of every window: one object, shared by the folders open in it. */
const windowHostSettings = new WeakMap<object, Promise<HostSettings>>();

/**
 * The window's host settings over the profile's store, the same object for every folder open in
 * the window (`settings.ai-agent-prefs`). When they can't be read, the folder still opens: Settings
 * › Assistant says so and loads this same object again on Try again.
 */
export function hostSettingsOf(services: ServiceRegistry, window: object): Promise<HostSettings> {
  const known = windowHostSettings.get(window);
  if (known !== undefined) return known;
  const settings = new HostSettings(
    services.has(hostSettingsStoreKey)
      ? services.get(hostSettingsStoreKey)
      : new MemoryHostSettingsStore(),
    { onRefreshError: (error) => console.error(error) },
  );
  const opened = settings.load().then(
    () => settings,
    (error: unknown) => {
      console.error(error);
      return settings;
    },
  );
  windowHostSettings.set(window, opened);
  return opened;
}
