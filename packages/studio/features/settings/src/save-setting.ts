import type { DisplayPref } from "./display-prefs.ts";
import type { DisplaySettings } from "./display-settings.ts";
import type { SaveFailedText } from "./save-failed.ts";
import type { SettingsWhere } from "./where.ts";

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
 * `announce`: the settings container's live region while the dialog is open, never a toast then;
 * the view passes one that toasts once its section is gone (`settings.failed-save`). On the
 * phone's page the view passes `where`, so the parts' line says "on this phone", and always toasts.
 */
export function saveSetting(
  settings: DisplaySettings,
  announce: (text: string, parts: { readonly line: string; readonly back: string }) => void,
  where?: SettingsWhere,
): SaveSetting {
  return async (pref, value, text, name) => {
    const outcome = await settings.set(pref, value);
    if (!outcome.saved && !outcome.superseded) {
      const back = text.backTo(name(outcome.back));
      const line = where === undefined ? text.line : text.lineOn(where);
      announce(text.announce(name(outcome.back)), { line, back });
    }
  };
}
