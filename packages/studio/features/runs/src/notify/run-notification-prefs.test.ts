import type { HostSetting } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runNotificationPrefs, runNotificationSettingsOf } from "./run-notification-prefs.ts";

/** Reads from `saved` as `HostSettings.get` does: a value its setting refuses gives the fallback. */
function savedSettings(saved: Record<string, unknown>) {
  return {
    get: (setting: HostSetting<boolean>): boolean => {
      const value = saved[setting.key];
      return setting.accepts(value) ? value : setting.fallback;
    },
  };
}

verifies("runs.run-notification-prefs", () => {
  it("reads the design's defaults when nothing is saved", () => {
    expect(runNotificationSettingsOf(savedSettings({}))).toEqual({
      failed: true,
      startedByMeFinished: true,
      anyFinished: false,
    });
  });

  it("reads what was saved, and a value that isn't on or off as the default", () => {
    const settings = savedSettings({
      [runNotificationPrefs.failed.key]: false,
      [runNotificationPrefs.startedByMeFinished.key]: false,
      [runNotificationPrefs.anyFinished.key]: "yes",
    });
    expect(runNotificationSettingsOf(settings)).toEqual({
      failed: false,
      startedByMeFinished: false,
      anyFinished: false,
    });
  });

  it("keeps each switch under its own key, outside any workspace", () => {
    expect(Object.values(runNotificationPrefs).map(({ key }) => key)).toEqual([
      "notifications.runs.failed",
      "notifications.runs.started-by-me-finished",
      "notifications.runs.any-finished",
    ]);
  });
});
