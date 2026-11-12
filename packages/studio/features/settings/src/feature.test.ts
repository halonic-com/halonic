import { createShell, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { DisplaySettingsService } from "./api.ts";
import { sectionsByName, settingsFeature, settingsSections } from "./feature.ts";

describe("settingsFeature", () => {
  it("is registered under its folder name", () => {
    expect(settingsFeature.id).toBe("settings");
  });

  it("adds Appearance to the settings saved on this computer", async () => {
    const shell = createShell({
      features: [settingsFeature],
      hostServices: [DisplaySettingsService],
    });
    const [appearance] = shell.contributions.settings.list();
    expect(appearance).toMatchObject({ id: "appearance", title: "Appearance", scope: "display" });
    const module = await appearance?.load();
    expect(module).toHaveProperty(appearance?.view ?? "");
  });
});

verifies("settings.feature", () => {
  it("adds every section in its list to Settings", () => {
    const shell = createShell({
      features: [settingsFeature],
      hostServices: [DisplaySettingsService],
    });

    const ids = shell.contributions.settings.list().map((section) => section.id);
    expect(ids.sort()).toEqual(settingsSections.map((section) => section.id).sort());
  });

  it("opens Settings from the command Settings", async () => {
    const shell = createShell({
      features: [settingsFeature],
      hostServices: [DisplaySettingsService],
    });
    const opened: (string | undefined)[] = [];
    const context = {
      openSettings: (sectionId?: string) => opened.push(sectionId),
    } as unknown as WorkspaceContext;

    const command = shell.contributions.commands.get("settings.open");
    await command?.run(context);

    expect(command?.title).toBe("Settings");
    expect(opened).toEqual([undefined]);
  });
});

verifies("settings.section-commands", () => {
  const shell = createShell({
    features: [settingsFeature],
    hostServices: [DisplaySettingsService],
  });

  function contextWith(ids: readonly string[], opened: (string | undefined)[] = []) {
    const titles: Record<string, string> = {
      appearance: "Appearance",
      formats: "Formats",
      assistant: "Assistant",
      "trusted-sources": "Trusted sources",
      "agent-sandbox": "Agent sandbox",
      models: "Models",
      developer: "Developer",
    };
    return {
      openSettings: (sectionId?: string) => opened.push(sectionId),
      settingsSections: ids.map((id) => ({ id, title: titles[id] ?? id })),
    } as unknown as WorkspaceContext;
  }

  function titlesFor(context: WorkspaceContext | undefined) {
    return shell.contributions.commands
      .list(() => context as WorkspaceContext)
      .filter((command) => command.id.startsWith("settings.section."))
      .map((command) => command.title);
  }

  it("lists a command per added section Ctrl K names, and none for the others", () => {
    const context = contextWith(["models", "appearance", "formats", "developer"]);

    expect(titlesFor(context)).toEqual(["Appearance", "Formats"]);
  });

  it("names each of the five sections as its row", () => {
    expect(titlesFor(contextWith(sectionsByName)).sort()).toEqual([
      "Agent sandbox",
      "Appearance",
      "Assistant",
      "Formats",
      "Trusted sources",
    ]);
  });

  it("lists none without the window's sections", () => {
    expect(titlesFor(undefined)).toEqual([]);
  });

  it("opens Settings on its section", async () => {
    const opened: (string | undefined)[] = [];
    const context = contextWith(["assistant"], opened);

    const command = shell.contributions.commands.get("settings.section.assistant", () => context);
    await command?.run(context);

    expect(opened).toEqual(["assistant"]);
  });
});
