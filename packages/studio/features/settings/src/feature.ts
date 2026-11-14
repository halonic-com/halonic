import { defineFeature, type SettingsSectionContribution } from "@halonicjs/studio-shell";
import {
  AgentSandboxService,
  AssistantWorkspaceService,
  DisplaySettingsService,
  HostSettingsService,
  UpdaterService,
} from "./api.ts";
import { agentCharactersPref, themePref } from "./appearance/appearance-prefs.ts";
import { onOrOff, themeNames } from "./appearance/appearance-text.ts";

/**
 * The sections this feature adds to Settings, in no particular order: the shell lists them by
 * scope, then `order` (`shell.frame-points`). A new section goes into this list.
 */
export const settingsSections: readonly SettingsSectionContribution[] = [
  {
    id: "models",
    title: "Models",
    scope: "workspace",
    order: 10,
    view: "ModelsLinkSection",
    load: () => import("./links/workspace-links.tsx"),
  },
  {
    id: "trust",
    title: "Trust",
    scope: "workspace",
    order: 20,
    view: "TrustLinkSection",
    load: () => import("./links/workspace-links.tsx"),
  },
  {
    id: "appearance",
    title: "Appearance",
    scope: "display",
    order: 10,
    summary(context) {
      const settings = context.services.get(DisplaySettingsService);
      return `${themeNames[settings.get(themePref)]} theme · characters ${onOrOff(settings.get(agentCharactersPref))}`;
    },
    view: "AppearanceSection",
    load: () => import("./appearance/appearance-section.tsx"),
  },
  {
    id: "formats",
    title: "Formats",
    scope: "display",
    order: 20,
    view: "FormatsSection",
    load: () => import("./formats/formats-section.tsx"),
  },
  {
    id: "assistant",
    title: "Assistant",
    scope: "host",
    order: 10,
    view: "AssistantSection",
    load: () => import("./assistant/assistant-section.tsx"),
  },
  {
    id: "agent-sandbox",
    title: "Agent sandbox",
    scope: "host",
    order: 30,
    view: "AgentSandboxSection",
    load: () => import("./agent-sandbox/agent-sandbox-section.tsx"),
  },
  {
    id: "about",
    title: "About Halonic",
    scope: "host",
    order: 60,
    view: "AboutSection",
    load: () => import("./updater/about-section.tsx"),
  },
];

/**
 * The sections Ctrl K opens by their name (flow-settings 12), whichever feature adds them. Models
 * and Trust aren't here: Ctrl K takes them straight to the workspace page.
 */
export const sectionsByName: readonly string[] = [
  "appearance",
  "formats",
  "assistant",
  "trusted-sources",
  "agent-sandbox",
];

/**
 * The Settings feature (`settings.feature`). It adds its sections to the settings container,
 * which the shell owns, the command **Settings** (`settings.open`), which opens it through the
 * window's `openSettings`, and a command per section in `sectionsByName` that a feature added
 * (`settings.section-commands`), named as its row, which opens Settings on it. It reads the
 * window's display settings from the app (`DisplaySettingsService`) and the computer's host
 * settings (`HostSettingsService`). It reads the updater, the agent sandbox and the Assistant's
 * workspace only if the app gives them.
 */
export const settingsFeature = defineFeature({
  id: "settings",
  title: "Settings",
  needs: [DisplaySettingsService, HostSettingsService],
  // Only the desktop app gives these; served Studio and the demo show the sections without them.
  wants: [UpdaterService, AgentSandboxService, AssistantWorkspaceService],
  register(studio) {
    for (const section of settingsSections) {
      studio.settings.add(section);
    }
    studio.commands.add({
      id: "settings.open",
      title: "Settings",
      run: (context) => context.openSettings?.(),
    });
    studio.commands.addSource({
      id: "settings.section",
      commands: (context) =>
        (context?.settingsSections ?? [])
          .filter((section) => sectionsByName.includes(section.id))
          .map((section) => ({
            id: `settings.section.${section.id}`,
            title: section.title,
            run: (runContext) => runContext.openSettings?.(section.id),
          })),
    });
  },
});
