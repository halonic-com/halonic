import { createShell, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { settingsFeature, settingsSections } from "./feature.ts";

describe("settingsFeature", () => {
  it("is registered under its folder name", () => {
    expect(settingsFeature.id).toBe("settings");
  });
});

verifies("settings.feature", () => {
  it("adds every section in its list to Settings", () => {
    const shell = createShell({ features: [settingsFeature] });

    const ids = shell.contributions.settings.list().map((section) => section.id);
    expect(ids.sort()).toEqual(settingsSections.map((section) => section.id).sort());
  });

  it("opens Settings from the command Settings", async () => {
    const shell = createShell({ features: [settingsFeature] });
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
