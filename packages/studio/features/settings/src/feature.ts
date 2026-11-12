import { defineFeature, type SettingsSectionContribution } from "@halonicjs/studio-shell";
import { DisplaySettingsService } from "./api.ts";

/**
 * The sections this feature adds to Settings, in no particular order: the shell lists them by
 * scope, then `order` (`shell.frame-points`). A new section goes into this list.
 */
export const settingsSections: readonly SettingsSectionContribution[] = [
  {
    id: "appearance",
    title: "Appearance",
    scope: "display",
    order: 10,
    view: "AppearanceSection",
    load: () => import("./appearance/appearance-section.tsx"),
  },
];

/**
 * The Settings feature (`settings.feature`). It adds its sections to the settings container,
 * which the shell owns, and the command **Settings** (`settings.open`), which opens it through
 * the window's `openSettings`. It reads the window's display settings from the app
 * (`DisplaySettingsService`).
 */
export const settingsFeature = defineFeature({
  id: "settings",
  title: "Settings",
  needs: [DisplaySettingsService],
  register(studio) {
    for (const section of settingsSections) {
      studio.settings.add(section);
    }
    studio.commands.add({
      id: "settings.open",
      title: "Settings",
      run: (context) => context.openSettings?.(),
    });
  },
});
