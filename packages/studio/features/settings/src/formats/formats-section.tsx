import { Field, Select, useToastStore } from "@halonicjs/studio-kit";
import type { SettingsPlace, SettingsSectionProps, SettingsSurface } from "@halonicjs/studio-shell";
import { useMemo } from "react";
import { DisplaySettingsService } from "../api.ts";
import type { DisplaySettings } from "../display-settings.ts";
import { saveSetting } from "../save-setting.ts";
import { useDisplaySetting } from "../use-display-setting.ts";
import { settingsWhere } from "../where.ts";
import {
  type FormatChoice,
  formatExample,
  formatLocale,
  formatOptions,
  formatPref,
} from "./format-pref.ts";
import { FORMAT, FORMAT_NOT_SAVED } from "./formats-text.ts";

/**
 * Settings → Formats as the settings container shows it. "Follow" follows the system's region
 * format the shell passes in the desktop app, else the browser's language: the webview's language
 * isn't the user's region setting, as English Windows with Dutch region settings shows.
 */
export function FormatsSection({ context, place, surface, regionFormat }: SettingsSectionProps) {
  return (
    <FormatsView
      settings={context.services.get(DisplaySettingsService)}
      announce={(text) => context.announcer.announce(text)}
      place={place}
      surface={surface}
      followTag={regionFormat ?? navigator.language}
    />
  );
}

/** The props of {@link FormatsView}. */
export interface FormatsViewProps {
  readonly settings: DisplaySettings;
  /** Says a failed save in the dialog: the settings container's live region. */
  readonly announce: (text: string) => void;
  readonly place: SettingsPlace;
  /**
   * `phone` on the phone's Settings page (mc 13.2): "Follow this phone" in the picker sheet, which
   * has a search, and a failed save is a toast, not a line under the control.
   */
  readonly surface?: SettingsSurface;
  /** The format "Follow" uses, as the computer or browser gives it. */
  readonly followTag: string;
}

/**
 * Settings → Formats (flow-settings 5, UX checklist 3.10): one Format for numbers, dates and money,
 * with an example under it, saved by itself (`settings.formats-section`).
 *
 * @example
 * <FormatsView settings={settings} announce={say} place="app" followTag="en-GB" />
 */
export function FormatsView({
  settings,
  announce,
  place,
  surface = "window",
  followTag,
}: FormatsViewProps) {
  const format = useDisplaySetting(settings, formatPref);
  const options = useMemo(
    () => formatOptions({ followTag, place, surface }),
    [followTag, place, surface],
  );
  const phone = surface === "phone";
  const toasts = useToastStore();
  // The dialog's live region says the one sentence; the title + line split is for toasts.
  const save = saveSetting(
    settings,
    (text, { line, back }) =>
      phone ? toasts?.show({ tone: "danger", title: line, text: back }) : announce(text),
    phone ? settingsWhere(place, surface) : undefined,
  );
  const nameOf = (choice: FormatChoice) =>
    options.find((option) => option.value === choice)?.label ?? choice;

  return (
    <div className="mt-5 flex max-w-90 flex-col gap-4">
      <Field
        label={FORMAT}
        hint={formatExample(formatLocale(format.value, followTag))}
        error={format.failed && !phone ? FORMAT_NOT_SAVED.line : null}
      >
        <Select
          options={options}
          value={format.value}
          onChange={(picked) =>
            save(
              formatPref,
              formatPref.read(picked) ?? formatPref.fallback,
              FORMAT_NOT_SAVED,
              nameOf,
            )
          }
        />
      </Field>
    </div>
  );
}
