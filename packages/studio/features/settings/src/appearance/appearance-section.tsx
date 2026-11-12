import { Field, Select, Slider, Switch } from "@halonicjs/studio-kit";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { DisplaySettingsService } from "../api.ts";
import type { DisplaySettings } from "../display-settings.ts";
import { useDisplaySetting } from "../use-display-setting.ts";
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
import { saveSetting } from "./save-setting.ts";

const themeOptions = themes.map((theme) => ({ value: theme, label: themeNames[theme] }));

const nameOf = (theme: Theme) => themeNames[theme];

/** Settings → Appearance as the settings container shows it. */
export function AppearanceSection({ context }: SettingsSectionProps) {
  return (
    <AppearanceView
      settings={context.services.get(DisplaySettingsService)}
      announce={(text) => context.announcer.announce(text)}
    />
  );
}

/** The props of {@link AppearanceView}. */
export interface AppearanceViewProps {
  readonly settings: DisplaySettings;
  /** Says a failed save in the dialog: the settings container's live region. */
  readonly announce: (text: string) => void;
}

/**
 * Settings → Appearance (flow-settings 5, UX checklist 3.7): Theme, Frame colours, Panel opacity
 * and Agent characters, each applied to the whole window at once and saved by itself. A failed
 * save puts the value from before back, says so under the control until it next saves, and says
 * it in the dialog, never in a toast (`settings.failed-save`).
 *
 * @example
 * <AppearanceView settings={displaySettings} announce={(text) => announcer.announce(text)} />
 */
export function AppearanceView({ settings, announce }: AppearanceViewProps) {
  const theme = useDisplaySetting(settings, themePref);
  const opacity = useDisplaySetting(settings, panelOpacityPref);
  const characters = useDisplaySetting(settings, agentCharactersPref);

  const save = saveSetting(settings, announce);

  return (
    <div className="mt-5 flex max-w-90 flex-col gap-4">
      <Field label={THEME} error={theme.failed ? THEME_NOT_SAVED.line : null}>
        <Select
          options={themeOptions}
          value={theme.value}
          onChange={(picked) =>
            save(themePref, themePref.read(picked) ?? themePref.fallback, THEME_NOT_SAVED, nameOf)
          }
        />
      </Field>
      <FrameColoursField settings={settings} save={save} />
      <Field
        label={PANEL_OPACITY}
        hint={PANEL_OPACITY_HINT}
        error={opacity.failed ? PANEL_OPACITY_NOT_SAVED.line : null}
      >
        <Slider
          {...panelOpacityRange}
          value={opacity.value}
          format={percent}
          onChange={(moved) => settings.preview(panelOpacityPref, moved)}
          onCommit={(picked) => save(panelOpacityPref, picked, PANEL_OPACITY_NOT_SAVED, percent)}
        />
      </Field>
      <Field
        label={AGENT_CHARACTERS}
        error={characters.failed ? AGENT_CHARACTERS_NOT_SAVED.line : null}
      >
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
