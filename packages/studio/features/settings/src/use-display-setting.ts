import { useCallback, useSyncExternalStore } from "react";
import type { DisplayPref } from "./display-prefs.ts";
import type { DisplaySettings } from "./display-settings.ts";

/** A display setting as a control shows it: its value, and whether its last save failed. */
export interface ShownSetting<Value> {
  readonly value: Value;
  readonly failed: boolean;
}

/**
 * Reads `pref` from `settings` and draws again whenever it changes, here or in another window.
 *
 * @example
 * const theme = useDisplaySetting(settings, themePref);
 */
export function useDisplaySetting<Value>(
  settings: DisplaySettings,
  pref: DisplayPref<Value>,
): ShownSetting<Value> {
  const subscribe = useCallback((listener: () => void) => settings.subscribe(listener), [settings]);
  const value = useSyncExternalStore(subscribe, () => settings.get(pref));
  const failed = useSyncExternalStore(subscribe, () => settings.failure(pref) !== undefined);
  return { value, failed };
}
