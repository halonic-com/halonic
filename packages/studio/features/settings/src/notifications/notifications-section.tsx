import type { HostSetting, HostSettings } from "@halonicjs/app";
import {
  runNotificationPrefs,
  runNotificationSettingWords,
} from "@halonicjs/studio-feature-runs/api";
import { Switch } from "@halonicjs/studio-kit";
import {
  type SettingsSectionProps,
  type SettingsSurface,
  sectionHeadingLevel,
} from "@halonicjs/studio-shell";
import { HostSettingsService } from "../api.ts";
import { useHostSetting } from "../assistant/use-host-setting.ts";
import { NotLoaded, useLoaded } from "../host-settings-loaded.tsx";
import { NOT_LOADED, notSaved, switchBack } from "./notifications-text.ts";

/**
 * Settings → Notifications as the settings container shows it. Host settings that couldn't be
 * read show the Assistant's error and Try again, under this section's own heading.
 */
export function NotificationsSection({ context, surface }: SettingsSectionProps) {
  const settings = context.services.get(HostSettingsService);
  const loaded = useLoaded(settings);
  if (!loaded.ready) {
    return (
      <NotLoaded
        title={NOT_LOADED}
        reason={loaded.reason}
        trying={loaded.trying}
        onTryAgain={loaded.tryAgain}
        surface={surface}
      />
    );
  }
  return (
    <NotificationsView
      settings={settings}
      announce={(line) => context.announcer.announce(line)}
      surface={surface}
    />
  );
}

/** The props of {@link NotificationsView}. */
export interface NotificationsViewProps {
  /** The computer's host settings, loaded. */
  readonly settings: HostSettings;
  /** Says a failed save in the dialog: the settings container's live region. */
  readonly announce: (line: string) => void;
  readonly surface?: SettingsSurface;
}

/** The Runs switches, in the order the design lists them. */
const runSwitches = ["failed", "startedByMeFinished", "anyFinished"] as const;

/**
 * Settings → Notifications (`settings.notifications-section`): under **Runs**, the three switches
 * of design revision 3 on HAL-18594, each saved by itself as a host setting the run notifications
 * read (`runs.run-notification-prefs`).
 *
 * @example
 * <NotificationsView settings={hostSettings} announce={say} />
 */
export function NotificationsView({
  settings,
  announce,
  surface = "window",
}: NotificationsViewProps) {
  // h4 under the dialog's h3, h2 under the phone page's h1, as the Assistant's groups.
  const Group = `h${sectionHeadingLevel(surface)}` as const;
  return (
    <div className="flex max-w-90 flex-col gap-3">
      <Group className="text-body-strong">{runNotificationSettingWords.heading}</Group>
      {runSwitches.map((name) => (
        <SavedSwitch
          key={name}
          settings={settings}
          setting={runNotificationPrefs[name]}
          sentence={runNotificationSettingWords[name]}
          announce={announce}
        />
      ))}
    </div>
  );
}

/** One switch that saves itself, with "Couldn't save …" under it while its last save failed. */
function SavedSwitch(props: {
  readonly settings: HostSettings;
  readonly setting: HostSetting<boolean>;
  readonly sentence: string;
  readonly announce: (line: string) => void;
}) {
  const shown = useHostSetting(props.settings, props.setting);
  async function toggle(on: boolean) {
    if (!(await shown.save(on))) {
      props.announce(`${notSaved(props.sentence)} ${switchBack(shown.value)}`);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <Switch checked={shown.value} onChange={toggle}>
        {props.sentence}
      </Switch>
      {shown.failed ? <p className="text-small text-danger">{notSaved(props.sentence)}</p> : null}
    </div>
  );
}
