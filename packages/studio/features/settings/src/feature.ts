import { defineFeature, type SettingsSectionContribution } from "@halonicjs/studio-shell";

/**
 * The sections this feature adds to Settings, in no particular order: the shell lists them by
 * scope, then `order` (`shell.frame-points`). A new section goes into this list.
 */
export const settingsSections: readonly SettingsSectionContribution[] = [];

/**
 * The Settings feature (`settings.feature`). It adds its sections to the settings container,
 * which the shell owns, and the command **Settings** (`settings.open`), which opens it through
 * the window's `openSettings`.
 */
export const settingsFeature = defineFeature({
  id: "settings",
  title: "Settings",
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
