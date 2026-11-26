import { sandboxStartCheckKey } from "@halonicjs/app";
import { defineFeature, type SettingsSectionContribution } from "@halonicjs/studio-shell";
import { sandboxCommands } from "./agent-sandbox/sandbox-commands.ts";
import { createSandboxFlow, SandboxFlowService } from "./agent-sandbox/sandbox-flow.ts";
import * as sandboxText from "./agent-sandbox/sandbox-text.ts";
import {
  AgentSandboxService,
  AssistantWorkspaceService,
  DisplaySettingsService,
  HalonicVersionService,
  HostSettingsService,
  RestartRunsService,
  UnfencedYesService,
  UpdaterService,
} from "./api.ts";
import { agentCharactersPref, themePref } from "./appearance/appearance-prefs.ts";
import { onOrOff, themeNames } from "./appearance/appearance-text.ts";
import * as assistantText from "./assistant/assistant-text.ts";
import * as notificationsText from "./notifications/notifications-text.ts";
import { agentSandboxSummary, assistantSummary } from "./section-summaries.ts";
import * as serverSessionText from "./server-session/server-session-text.ts";
import { showUnfinishedSettings, unfinishedSectionIds } from "./unfinished.ts";
import { createRestartFlow, RestartFlowService } from "./updater/restart-flow.ts";
import { updateCommands } from "./updater/update-commands.ts";

/**
 * The sections this feature adds to Settings, in no particular order: the shell lists them by
 * `group` in the desktop app's dialog (`shell.settings-dialog-groups`) and by scope elsewhere,
 * then `order` (`shell.frame-points`). A new section goes into this list. Without
 * `showUnfinished` it leaves out the sections hidden until they work, and Appearance's summary
 * leaves out Agent characters (`unfinished.ts`).
 */
export function settingsSectionsFor(showUnfinished: boolean): SettingsSectionContribution[] {
  const sections: SettingsSectionContribution[] = [
    {
      id: "appearance",
      icon: "appearance",
      title: "Appearance",
      scope: "display",
      group: "general",
      order: 10,
      summary(context) {
        const settings = context.services.get(DisplaySettingsService);
        const theme = `${themeNames[settings.get(themePref)]} theme`;
        if (!showUnfinished) return theme;
        return `${theme} · characters ${onOrOff(settings.get(agentCharactersPref))}`;
      },
      view: "AppearanceSection",
      load: () => import("./appearance/appearance-section.tsx"),
    },
    {
      id: "formats",
      icon: "formats",
      title: "Formats",
      scope: "display",
      group: "general",
      order: 20,
      view: "FormatsSection",
      load: () => import("./formats/formats-section.tsx"),
    },
    {
      id: "assistant",
      icon: "assistant",
      title: "Assistant",
      scope: "host",
      group: "agents",
      order: 10,
      description: (_context, place) => assistantText.FIRST_LINE[place],
      summary: assistantSummary,
      view: "AssistantSection",
      load: () => import("./assistant/assistant-section.tsx"),
    },
    {
      id: "notifications",
      icon: "notifications",
      title: notificationsText.TITLE,
      scope: "host",
      group: "general",
      // After Formats (20), by its id.
      order: 20,
      view: "NotificationsSection",
      load: () => import("./notifications/notifications-section.tsx"),
    },
    {
      id: "agent-sandbox",
      icon: "agent-sandbox",
      title: "Agent sandbox",
      scope: "host",
      group: "agents",
      order: 30,
      description: sandboxText.FIRST_LINE,
      summary: agentSandboxSummary,
      view: "AgentSandboxSection",
      load: () => import("./agent-sandbox/agent-sandbox-section.tsx"),
    },
    {
      id: "server-session",
      icon: "server-session",
      title: serverSessionText.TITLE,
      scope: "host",
      group: "connections",
      // After Remote (35).
      order: 50,
      description: serverSessionText.FIRST_LINE,
      view: "ServerSessionSection",
      load: () => import("./server-session/server-session-section.tsx"),
    },
    {
      id: "about",
      icon: "about",
      title: "About Halonic",
      scope: "host",
      group: "about",
      // Last everywhere, after Plugins (60) too, which shares served Studio's host group.
      order: 90,
      view: "AboutSection",
      load: () => import("./updater/about-section.tsx"),
    },
  ];
  if (showUnfinished) return sections;
  return sections.filter((section) => !unfinishedSectionIds.includes(section.id));
}

/** The sections Settings shows: {@link settingsSectionsFor} with the unfinished ones hidden. */
export const settingsSections: readonly SettingsSectionContribution[] =
  settingsSectionsFor(showUnfinishedSettings);

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
 * The Settings feature (`settings.feature`), as {@link createSettingsFeature} makes it with the
 * unfinished controls hidden.
 */
export const settingsFeature = createSettingsFeature();

/**
 * Makes the Settings feature (`settings.feature`). It adds its sections to the settings container,
 * which the shell owns, the command **Settings** (`settings.open`), which opens it through the
 * window's `openSettings`, and a command per section in `sectionsByName` that a feature added
 * (`settings.section-commands`), named as its row, which opens Settings on it. It reads the
 * window's display settings from the app (`DisplaySettingsService`) and the computer's host
 * settings (`HostSettingsService`). It reads the updater, the agent sandbox and the Assistant's
 * workspace only if the app gives them. For updates it adds the title bar's Update button and its
 * dialog (`settings.update-button`), the status bar's Restart to update, the restart dialog, the
 * Updated to dialog and update toasts (`settings.restart-flow`), and the Ctrl K commands Check for
 * Halonic updates, About Halonic and Restart to update Halonic. Only with `showUnfinished` does
 * it add the sections hidden until they work (`unfinished.ts`).
 */
export function createSettingsFeature(showUnfinished = showUnfinishedSettings) {
  const sections = settingsSectionsFor(showUnfinished);
  return defineFeature({
    id: "settings",
    title: "Settings",
    needs: [DisplaySettingsService, HostSettingsService],
    // Only the desktop app gives these; served Studio and the demo show the sections without them.
    provides: [RestartFlowService, SandboxFlowService],
    wants: [
      HalonicVersionService,
      UpdaterService,
      RestartRunsService,
      AgentSandboxService,
      // Settings › Agent sandbox's "Plugins and integrations" and its Take back (R16).
      UnfencedYesService,
      AssistantWorkspaceService,
      // Says why the sandbox can't start, under Settings › Agent sandbox's Not available.
      sandboxStartCheckKey,
    ],
    register(studio) {
      studio.services.provide(RestartFlowService, createRestartFlow);
      studio.services.provide(SandboxFlowService, createSandboxFlow);
      studio.statusBar.add({
        id: "settings.restart-item",
        order: 1000,
        view: "RestartStatusItem",
        load: () => import("./updater/restart-status-item.tsx"),
      });
      // Before the account menu (100), at the title bar's right end.
      studio.titleBar.add({
        id: "settings.update-button",
        order: 50,
        view: "UpdateButton",
        load: () => import("./updater/update-button.tsx"),
      });
      studio.dialogs.add({
        id: "settings.restart-host",
        order: 10,
        view: "RestartHost",
        load: () => import("./updater/restart-host.tsx"),
      });
      studio.dialogs.add({
        id: "settings.sandbox-host",
        order: 20,
        view: "SandboxHost",
        load: () => import("./agent-sandbox/sandbox-host.tsx"),
      });
      for (const section of sections) {
        studio.settings.add(section);
      }
      studio.commands.add({
        id: "settings.open",
        title: "Settings",
        run: (context) => context.openSettings?.(),
      });
      studio.commands.addSource({
        id: "settings.sandbox",
        commands: (context) => sandboxCommands(context),
      });
      studio.commands.addSource({
        id: "settings.update",
        commands: (context) => updateCommands(context),
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
}
