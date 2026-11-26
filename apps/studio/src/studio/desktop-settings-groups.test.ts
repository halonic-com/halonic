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

  it("lists Trusted sources right after Trust, then Agent sandbox, in Agents", () => {
    const agents = settingsGroups({
      sections: desktopSections(),
      workspaceName: "Acme",
      place: "app",
    }).find((group) => group.name === "Agents");

    const rows = agents?.sections.map((section) => section.id) ?? [];
    const trust = rows.indexOf("trust");
    expect(trust).toBeGreaterThanOrEqual(0);
    expect(rows.slice(trust, trust + 3)).toEqual(["trust", "trusted-sources", "agent-sandbox"]);
  });

  // A tie would leave two rows' order to their ids, so a new section could reorder them.
  it("gives no two sections in one group the same order", () => {
    const seen = new Map<string, string>();
    for (const section of desktopSections()) {
      const key = `${section.group}:${section.order}`;
      expect(seen.get(key), `${section.id} shares ${key}`).toBeUndefined();
      seen.set(key, section.id);
    }
  });
});
