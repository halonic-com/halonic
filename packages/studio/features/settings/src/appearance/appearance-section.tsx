import { Field, Select, Slider, Switch, useToastStore } from "@halonicjs/studio-kit";
import type { SettingsPlace, SettingsSectionProps, SettingsSurface } from "@halonicjs/studio-shell";
import { useEffect, useRef } from "react";
import { DisplaySettingsService } from "../api.ts";
import type { DisplaySettings } from "../display-settings.ts";
import type { SaveFailedText } from "../save-failed.ts";
import { saveSetting } from "../save-setting.ts";
import { useDisplaySetting } from "../use-display-setting.ts";
import { settingsWhere } from "../where.ts";
import {
  agentCharactersPref,
  panelOpacityPref,
  panelOpacityRange,
  type Theme,
  themePref,
  themes,
} from "./appearance-prefs.ts";
import {
  AGENT_CHARACTERS,
  AGENT_CHARACTERS_NOT_SAVED,
  AGENT_CHARACTERS_SENTENCE,
  onOrOff,
  PANEL_OPACITY,
  PANEL_OPACITY_HINT,
  PANEL_OPACITY_NOT_SAVED,
  percent,
  THEME,
  THEME_NOT_SAVED,
  themeNames,
} from "./appearance-text.ts";
import { FrameColoursField } from "./frame-colours-field.tsx";

const themeOptions = themes.map((theme) => ({ value: theme, label: themeNames[theme] }));

const nameOf = (theme: Theme) => themeNames[theme];

/** Settings → Appearance as the settings container shows it. */
export function AppearanceSection({ context, place, surface }: SettingsSectionProps) {
  return (
    <AppearanceView
      settings={context.services.get(DisplaySettingsService)}
      announce={(text) => context.announcer.announce(text)}
      place={place}
      surface={surface}
    />
  );
}

/** The props of {@link AppearanceView}. */
export interface AppearanceViewProps {
  readonly settings: DisplaySettings;
  /**
   * Says a failed save in the dialog: the settings container's live region. Once the section is
   * gone, the window's toast says it instead (a save that ends after Settings closed).
   */
  readonly announce: (text: string) => void;
  /**
   * `phone` on the phone's Settings page (mc 13.2): no Frame colours, no Panel opacity, and a
   * failed save is a toast, "Couldn't save the … on this phone.", not a line under the control.
   */
  readonly surface?: SettingsSurface;
  /** Where the values are kept, for the toast's words; served unless said. */
  readonly place?: SettingsPlace;
}

/**
 * Settings → Appearance (flow-settings 5, UX checklist 3.7): Theme, Frame colours, Panel opacity
 * and Agent characters, each applied to the whole window at once and saved by itself. A failed
 * save puts the value from before back, says so under the control until it next saves, and says
 * it in the dialog, never in a toast while the dialog is open; a save that fails after the section
 * is gone says it in a toast, which waits for a modal to close (`settings.failed-save`).
 *
 * @example
 * <AppearanceView settings={displaySettings} announce={(text) => announcer.announce(text)} />
 */
export function AppearanceView({
  settings,
  announce,
  place = "served",
  surface = "window",
}: AppearanceViewProps) {
  const phone = surface === "phone";
  const theme = useDisplaySetting(settings, themePref);
  const opacity = useDisplaySetting(settings, panelOpacityPref);
  const characters = useDisplaySetting(settings, agentCharactersPref);

  // The dialog closing mid-drag leaves nothing to save: the stored opacity comes back.
  useEffect(() => () => settings.endPreview(panelOpacityPref), [settings]);

  // A slider let go just before Settings closes may fail after it has gone: the dialog's live
  // region is gone too, so sighted people would see the value snap back with no word.
  const toasts = useToastStore();
  const present = useRef(false);
  useEffect(() => {
    present.current = true;
    return () => {
      present.current = false;
    };
  }, []);
  const save = saveSetting(
    settings,
    (text, { line, back }) =>
      present.current && !phone
        ? announce(text)
        : toasts?.show({ tone: "danger", title: line, text: back }),
    phone ? settingsWhere(place, surface) : undefined,
  );
  // The phone shows a failure as a toast, so no line sits under a control.
  const failed = (value: { readonly failed: boolean }, text: SaveFailedText) =>
    value.failed && !phone ? text.line : null;

  return (
    <div className="mt-5 flex max-w-90 flex-col gap-4">
      <Field label={THEME} error={failed(theme, THEME_NOT_SAVED)}>
        <Select
          options={themeOptions}
          value={theme.value}
          onChange={(picked) =>
            save(themePref, themePref.read(picked) ?? themePref.fallback, THEME_NOT_SAVED, nameOf)
          }
        />
      </Field>
      {phone ? null : <FrameColoursField settings={settings} save={save} />}
      {phone ? null : (
        <Field
          label={PANEL_OPACITY}
          hint={PANEL_OPACITY_HINT}
          error={failed(opacity, PANEL_OPACITY_NOT_SAVED)}
        >
          <Slider
            {...panelOpacityRange}
            value={opacity.value}
            format={percent}
            onChange={(moved) => settings.preview(panelOpacityPref, moved)}
            onCommit={(picked) => save(panelOpacityPref, picked, PANEL_OPACITY_NOT_SAVED, percent)}
            onEnd={() => settings.endPreview(panelOpacityPref)}
          />
        </Field>
      )}
      <Field label={AGENT_CHARACTERS} error={failed(characters, AGENT_CHARACTERS_NOT_SAVED)}>
        <Switch
          checked={characters.value}
          onChange={(on) => save(agentCharactersPref, on, AGENT_CHARACTERS_NOT_SAVED, onOrOff)}
        >
          {AGENT_CHARACTERS_SENTENCE}
        </Switch>
      </Field>
    </div>
  );
}
