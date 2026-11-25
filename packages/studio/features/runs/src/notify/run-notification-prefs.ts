// Where the three Runs switches are kept: host settings, for every workspace
// on the computer, so Settings › Notifications saves them and the background
// service's watch reads the same keys (requirement `runs.run-notification-prefs`).

import { type HostSetting, hostSetting } from "@halonicjs/app";
import { defaultRunNotificationSettings, type RunNotificationSettings } from "./run-notices.ts";

const isFlag = (value: unknown): value is boolean => typeof value === "boolean";

/** One host setting per switch under Settings › Notifications › Runs, with the design's defaults. */
export const runNotificationPrefs: {
  readonly [Switch in keyof RunNotificationSettings]: HostSetting<boolean>;
} = {
  failed: hostSetting("notifications.runs.failed", defaultRunNotificationSettings.failed, isFlag),
  startedByMeFinished: hostSetting(
    "notifications.runs.started-by-me-finished",
    defaultRunNotificationSettings.startedByMeFinished,
    isFlag,
  ),
  anyFinished: hostSetting(
    "notifications.runs.any-finished",
    defaultRunNotificationSettings.anyFinished,
    isFlag,
  ),
};

/**
 * The switches as they are saved now, for `watchRunNotifications`' `settings`. A value that
 * can't be read gives that switch's default. `settings` is the app's `HostSettings`.
 *
 * @example
 * watchRunNotifications(runs, notifier, { settings: () => runNotificationSettingsOf(host), … });
 */
export function runNotificationSettingsOf(settings: {
  get(setting: HostSetting<boolean>): boolean;
}): RunNotificationSettings {
  return {
    failed: settings.get(runNotificationPrefs.failed),
    startedByMeFinished: settings.get(runNotificationPrefs.startedByMeFinished),
    anyFinished: settings.get(runNotificationPrefs.anyFinished),
  };
}
