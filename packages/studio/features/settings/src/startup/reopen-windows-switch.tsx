import type { HostSettings } from "@halonicjs/app";
import { Switch } from "@halonicjs/studio-kit";
import type { SettingsSurface } from "@halonicjs/studio-shell";
import { useHostSetting } from "../assistant/use-host-setting.ts";
import { NotLoaded, useLoaded } from "../host-settings-loaded.tsx";
import { notSaved, switchBack } from "../notifications/notifications-text.ts";
import { reopenWindowsSetting } from "./reopen-windows.ts";
import * as text from "./startup-text.ts";

/** The props of {@link ReopenWindowsSwitch}. */
export interface ReopenWindowsSwitchProps {
  /** The computer's host settings, loaded or not. */
  readonly settings: HostSettings;
  /** Says a failed save in the dialog: the settings container's live region. */
  readonly announce: (line: string) => void;
  readonly surface?: SettingsSurface;
}

/**
 * Settings › Startup's second switch, **Reopen windows on start** (`settings.startup-section`),
 * saved by itself as the host setting the shell reads at start. While the host settings can't be
 * read it shows why, with Try again, as Settings › Notifications does.
 */
export function ReopenWindowsSwitch({
  settings,
  announce,
  surface = "window",
}: ReopenWindowsSwitchProps) {
  const loaded = useLoaded(settings);
  if (!loaded.ready) {
    return (
      <NotLoaded
        title={text.NOT_LOADED}
        reason={loaded.reason}
        trying={loaded.trying}
        onTryAgain={loaded.tryAgain}
        surface={surface}
      />
    );
  }
  return <LoadedSwitch settings={settings} announce={announce} />;
}

function LoadedSwitch({ settings, announce }: Omit<ReopenWindowsSwitchProps, "surface">) {
  const shown = useHostSetting(settings, reopenWindowsSetting);
  async function toggle(on: boolean) {
    if (!(await shown.save(on))) {
      announce(`${notSaved(text.REOPEN_WINDOWS)} ${switchBack(shown.value)}`);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <Switch checked={shown.value} onChange={toggle}>
        {text.REOPEN_WINDOWS}
      </Switch>
      {shown.failed ? (
        <p className="text-small text-danger">{notSaved(text.REOPEN_WINDOWS)}</p>
      ) : null}
    </div>
  );
}
