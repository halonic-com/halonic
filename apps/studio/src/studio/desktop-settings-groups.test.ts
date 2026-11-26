import { createShell, settingsGroupNames, settingsGroups } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { desktopFeatures } from "./desktop-features.ts";

function desktopSections() {
  return createShell({
    ...desktopFeatures,
    host: "desktop-app",
    platform: "windows",
  }).contributions.settings.list();
}

verifies("shell.settings-dialog-groups", () => {
  it("gives every section of the desktop app a group and an icon", () => {
    const sections = desktopSections();

    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(settingsGroupNames, section.id).toContain(section.group);
      expect(section.icon, section.id).toBeDefined();
    }
  });

  it("lists About Halonic last in the desktop app's Settings dialog", () => {
    const groups = settingsGroups({
      sections: desktopSections(),
      workspaceName: "Acme",
      place: "app",
    });

    const rows = groups.flatMap((group) => group.sections.map((section) => section.id));
    expect(rows.at(-1)).toBe("about");
    expect(groups.map((group) => group.name)).toEqual([
      "General",
      "Agents",
      "Account and connections",
      "Keyboard",
      "About",
    ]);
  });
});
