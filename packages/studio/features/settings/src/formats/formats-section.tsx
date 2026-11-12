import { Field, Select } from "@halonicjs/studio-kit";
import type { SettingsPlace, SettingsSectionProps } from "@halonicjs/studio-shell";
import { useMemo } from "react";
import { DisplaySettingsService } from "../api.ts";
import { saveSetting } from "../appearance/save-setting.ts";
import type { DisplaySettings } from "../display-settings.ts";
import { useDisplaySetting } from "../use-display-setting.ts";
import {
  type FormatChoice,
  formatExample,
  formatLocale,
  formatOptions,
  formatPref,
} from "./format-pref.ts";
import { FORMAT, FORMAT_HINT, FORMAT_NOT_SAVED } from "./formats-text.ts";

/**
 * Settings → Formats as the settings container shows it. "Follow" follows the browser's language
 * for now; the desktop shell's system region format comes with the desktop `DisplayPrefs` adapter.
 */
export function FormatsSection({ context, place }: SettingsSectionProps) {
  return (
    <FormatsView
      settings={context.services.get(DisplaySettingsService)}
      announce={(text) => context.announcer.announce(text)}
      place={place}
      followTag={navigator.language}
    />
  );
}

/** The props of {@link FormatsView}. */
export interface FormatsViewProps {
  readonly settings: DisplaySettings;
  /** Says a failed save in the dialog: the settings container's live region. */
  readonly announce: (text: string) => void;
  readonly place: SettingsPlace;
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
export function FormatsView({ settings, announce, place, followTag }: FormatsViewProps) {
  const format = useDisplaySetting(settings, formatPref);
  const options = useMemo(() => formatOptions({ followTag, place }), [followTag, place]);
  const save = saveSetting(settings, announce);
  const nameOf = (choice: FormatChoice) =>
    options.find((option) => option.value === choice)?.label ?? choice;

  return (
    <div className="mt-5 flex max-w-90 flex-col gap-4">
      <Field
        label={FORMAT}
        hint={`${FORMAT_HINT} ${formatExample(formatLocale(format.value, followTag))}`}
        error={format.failed ? FORMAT_NOT_SAVED.line : null}
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
