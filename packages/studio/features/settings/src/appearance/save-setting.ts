import type { DisplayPref } from "../display-prefs.ts";
import type { DisplaySettings } from "../display-settings.ts";
import type { SaveFailedText } from "./appearance-text.ts";

/**
 * Saves a setting from its control. When the save fails, and no newer change came in meanwhile,
 * the dialog says so with what the setting is back to, named by `name`.
 */
export type SaveSetting = <Value>(
  pref: DisplayPref<Value>,
  value: Value,
  text: SaveFailedText,
  name: (value: Value) => string,
) => Promise<void>;

/**
 * The {@link SaveSetting} of a section: it saves to `settings`, and says a failure through
 * `announce`, the settings container's live region, never a toast (`settings.failed-save`).
 */
export function saveSetting(
  settings: DisplaySettings,
  announce: (text: string) => void,
): SaveSetting {
  return async (pref, value, text, name) => {
    const outcome = await settings.set(pref, value);
    if (!outcome.saved && !outcome.superseded) {
      announce(text.announce(name(outcome.back)));
    }
  };
}
