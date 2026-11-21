// The plugin's saved settings, as the trust check reads them when it opens, so a host the person
// entered in a setting shows its value (HAL-3384, microcopy 24.1 R9's "set" form).

import type { Plugin, PluginSettingValue } from "@halonicjs/format";
import { useEffect, useState } from "react";
import type { PluginSettingsReader } from "../settings/plugin-settings-section.tsx";

/**
 * Reads `manifest`'s saved settings when the trust check opens. `undefined` while they're read,
 * when they can't be, and when there's nothing to read them from: R9 then keeps its row for a
 * setting not yet entered. An answer that comes after the dialog closed is dropped.
 *
 * @example
 * const values = useSettingValues(settings, manifest);
 */
export function useSettingValues(
  settings: Pick<PluginSettingsReader, "settings"> | undefined,
  manifest: Plugin,
): Readonly<Record<string, PluginSettingValue>> | undefined {
  const [values, setValues] = useState<Readonly<Record<string, PluginSettingValue>> | undefined>(
    undefined,
  );
  useEffect(() => {
    if (settings === undefined) return;
    let open = true;
    settings.settings(manifest).then(
      (answer) => {
        if (open) setValues(answer);
      },
      () => undefined,
    );
    return () => {
      open = false;
    };
  }, [settings, manifest]);
  return values;
}
