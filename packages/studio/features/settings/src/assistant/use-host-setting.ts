import type { HostSetting, HostSettings } from "@halonicjs/app";
import type { HostSettingValue } from "@halonicjs/ports";
import { useCallback, useEffect, useState } from "react";

/**
 * A host setting as a control shows it. `failed` is true from a save that failed until the next
 * one that works; the value is then still the one from before, so a pick goes back by itself.
 */
export interface ShownHostSetting<Value extends HostSettingValue> {
  readonly value: Value;
  readonly failed: boolean;
  /** Shows the failed line without a save of its own, when a change this setting leads did not finish. */
  readonly markFailed: () => void;
  /** Saves `value`, or puts the setting back to its default when it is `undefined`. Resolves to whether it saved. */
  readonly save: (value: Value | undefined) => Promise<boolean>;
}

/**
 * The Assistant's view of one host setting: it reads the value, draws again when another window or
 * the CLI changes it, and saves by itself, keeping the failure for the line under the control.
 *
 * @example
 * const turnLimit = useHostSetting(settings, assistantPrefs.turnLimit);
 */
export function useHostSetting<Value extends HostSettingValue>(
  settings: HostSettings,
  setting: HostSetting<Value>,
): ShownHostSetting<Value> {
  const [value, setValue] = useState(() => settings.get(setting));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setValue(settings.get(setting));
    return settings.onChange((keys) => {
      if (keys.includes(setting.key)) setValue(settings.get(setting));
    });
  }, [settings, setting]);
  const save = useCallback(
    async (next: Value | undefined) => {
      try {
        await (next === undefined ? settings.reset(setting) : settings.set(setting, next));
        setFailed(false);
        setValue(settings.get(setting));
        return true;
      } catch {
        setFailed(true);
        return false;
      }
    },
    [settings, setting],
  );
  const markFailed = useCallback(() => setFailed(true), []);
  return { value, failed, markFailed, save };
}
