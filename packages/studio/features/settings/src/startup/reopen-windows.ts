import { type HostSetting, hostSetting } from "@halonicjs/app";

/**
 * Settings › Startup's **Reopen windows on start**: whether the desktop shell opens every window
 * open at the last quit again when Halonic starts (`studio.src-tauri.open-windows`). The shell
 * reads this key itself, so it is the same string as its `open_windows::SETTING`. On when
 * nothing is saved.
 */
export const reopenWindowsSetting: HostSetting<boolean> = hostSetting(
  "windows.reopen-on-start",
  true,
  (value): value is boolean => typeof value === "boolean",
);
