/**
 * The services and types other features may use. Features import each
 * other only through this file. Anything that shows a plugin's answer
 * outside its own card or dialog draws it with PluginResult.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { PluginsHost, StudioPlugins } from "./plugins-service.ts";

export type { PluginsHost, StudioPlugins } from "./plugins-service.ts";
export { PluginResult, type PluginResultProps, type ResultShow } from "./ui/plugin-result.tsx";

/** The installed plugins and their tool calls. The app provides it for each open workspace. */
export const PluginsHostService: ServiceKey<PluginsHost> = serviceKey<PluginsHost>("plugins.host");

/** The open workspace's plugins, as the plugins feature's contributions use them. */
export const PluginsService: ServiceKey<StudioPlugins> = serviceKey<StudioPlugins>("plugins");

/**
 * Loads the Settings › Plugins view, for the CI screenshots (`docs/guides/e2e-screenshots.md`),
 * which draw it with made-up data. The app never calls it: the feature registers the section itself.
 */
export const loadPluginsSettingsSection = () => import("./list/plugins-settings-section.tsx");
