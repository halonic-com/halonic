import type { SettingsPlace, SettingsSurface } from "@halonicjs/studio-shell";

/** Whose settings these are, as the words say it: "this computer", "this browser", "this phone". */
export type SettingsWhere = "computer" | "browser" | "phone";

/**
 * Where the values are kept, for the words. The phone's page says "this phone" only when served,
 * as flow-settings 13 does; a narrow desktop window still says "this computer".
 *
 * @example
 * settingsWhere("served", "phone"); // "phone"
 */
export function settingsWhere(place: SettingsPlace, surface: SettingsSurface): SettingsWhere {
  if (place === "app") {
    return "computer";
  }
  return surface === "phone" ? "phone" : "browser";
}
