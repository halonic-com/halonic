/**
 * The services and types other features may use. Features import each
 * other only through this file.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { DisplaySettings } from "./display-settings.ts";

export type { DisplayPref } from "./display-prefs.ts";
export type { DisplaySettings, SaveOutcome } from "./display-settings.ts";

/**
 * The window's display settings: Appearance, Formats and Developer. The app makes one
 * `DisplaySettings` per window and gives that same one to every workspace, so a change in Settings
 * reaches the whole window at once.
 */
export const DisplaySettingsService: ServiceKey<DisplaySettings> =
  serviceKey<DisplaySettings>("settings.display");
