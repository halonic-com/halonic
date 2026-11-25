import type { HostSettings } from "@halonicjs/app";
import { useEffect, useState } from "react";
import type { KeepAwakeHost } from "../api.ts";
import { changeKeepAwake, keepAwakeSetting } from "./keep-awake.ts";

/** What the keep-awake switch needs: the saved setting and the shell's lock. */
export interface KeepAwakeParts {
  readonly settings: HostSettings;
  readonly host: KeepAwakeHost;
}

/** The keep-awake switch as Settings › Remote shows it: its value, and a change that saves it. */
export interface KeepAwakeSwitch {
  readonly keep: boolean;
  /** Tells the shell and saves; the value changes only when both worked. */
  readonly change: (keep: boolean, remoteOn: boolean) => Promise<void>;
}

/**
 * The keep-awake switch over `parts`, or `undefined` without them (served Studio, the phone), so
 * the row doesn't show. It draws again when another window or the CLI changes the setting.
 */
export function useKeepAwake(parts: KeepAwakeParts | undefined): KeepAwakeSwitch | undefined {
  const settings = parts?.settings;
  const [keep, setKeep] = useState(() => settings?.get(keepAwakeSetting) ?? false);
  useEffect(() => {
    if (settings === undefined) return;
    setKeep(settings.get(keepAwakeSetting));
    return settings.onChange((keys) => {
      if (keys.includes(keepAwakeSetting.key)) setKeep(settings.get(keepAwakeSetting));
    });
  }, [settings]);
  if (parts === undefined) return undefined;
  return {
    keep,
    change: async (next, remoteOn) => {
      await changeKeepAwake(parts.settings, parts.host, next, remoteOn);
      setKeep(next);
    },
  };
}
