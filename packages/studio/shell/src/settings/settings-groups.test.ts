import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type {
  SettingsGroupName,
  SettingsScope,
  SettingsSectionContribution,
} from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { sectionHeadingLevel } from "./headings.ts";
import { listedSections, type SettingsGroup, settingsGroups } from "./settings-groups.ts";
import { rowAfterKey } from "./settings-nav.tsx";

const load = async () => ({ View: () => "view" });

function section(
  id: string,
  scope: SettingsScope,
  order: number,
  group: SettingsGroupName = "general",
): Registered<SettingsSectionContribution> {
  return { id, title: id, scope, group, order, view: "View", load, featureId: id };
}

const sections = [
  section("assistant", "host", 30, "agents"),
  section("appearance", "display", 10),
  section("trust", "workspace", 20, "agents"),
  section("models", "workspace", 10, "agents"),
  section("developer", "display", 90),
];

/** Each group as its heading and the ids under it, as the list reads them. */
function headings(groups: readonly SettingsGroup[]) {
  return groups.map((group) => ({
    heading: [group.name, group.detail].filter((part) => part !== undefined).join(", "),
    ids: group.sections.map((listed) => listed.id),
  }));
}

/** Each divided group as its name for screen readers and the ids in it. */
function dividedGroups(groups: readonly SettingsGroup[]) {
  return groups.map((group) => ({
    divider: group.divider,
    name: group.name,
    ids: group.sections.map((listed) => listed.id),
  }));
}

verifies("shell.settings-dialog-groups", () => {
  describe("settingsGroups in the desktop app's dialog", () => {
    const everyGroup = [
      section("about", "host", 90, "about"),
      section("keyboard", "host", 36, "keyboard"),
      section("remote", "host", 35, "connections"),
      section("connections", "workspace", 30, "connections"),
      section("plugins", "host", 60, "agents"),
      ...sections,
    ];

    it("lists General, Agents, Account and connections, Keyboard and About, each by order, without headings", () => {
      const groups = settingsGroups({ sections: everyGroup, workspaceName: "Acme", place: "app" });
      expect(dividedGroups(groups)).toEqual([
        { divider: true, name: "General", ids: ["appearance", "developer"] },
        { divider: true, name: "Agents", ids: ["models", "trust", "assistant", "plugins"] },
        { divider: true, name: "Account and connections", ids: ["connections", "remote"] },
        { divider: true, name: "Keyboard", ids: ["keyboard"] },
        { divider: true, name: "About", ids: ["about"] },
      ]);
    });

    it("leaves out a workspace's sections and an empty group when no workspace is open", () => {
      const groups = settingsGroups({ sections, workspaceName: undefined, place: "app" });
      expect(dividedGroups(groups)).toEqual([
        { divider: true, name: "General", ids: ["appearance", "developer"] },
        { divider: true, name: "Agents", ids: ["assistant"] },
      ]);
    });
  });
});

verifies("shell.settings-container", () => {
  describe("settingsGroups", () => {
    it("splits this computer's group in a browser: the browser's sections, then the host's", () => {
      const groups = settingsGroups({ sections, workspaceName: "Acme", place: "served" });
      expect(headings(groups)).toEqual([
        { heading: "Acme, Workspace settings", ids: ["models", "trust"] },
        { heading: "In this browser", ids: ["appearance", "developer"] },
        { heading: "On the computer running Halonic", ids: ["assistant"] },
      ]);
    });

    it("heads a phone's groups On this phone and On your computer, without Developer", () => {
      const groups = settingsGroups({
        sections: sections.map((candidate) =>
          candidate.id === "developer" ? { ...candidate, phone: false as const } : candidate,
        ),
        workspaceName: "Acme",
        place: "served",
        phone: true,
      });
      expect(headings(groups)).toEqual([
        { heading: "Acme, Workspace settings", ids: ["models", "trust"] },
        { heading: "On this phone", ids: ["appearance"] },
        { heading: "On your computer", ids: ["assistant"] },
      ]);
    });

    it("keeps On this computer in the desktop app, even for a narrow window's phone list", () => {
      const groups = settingsGroups({
        sections,
        workspaceName: "Acme",
        place: "app",
        phone: true,
      });
      expect(headings(groups).map((group) => group.heading)).toEqual([
        "Acme, Workspace settings",
        "On this computer",
      ]);
    });

    it("leaves out the workspace's group when no workspace is open", () => {
      const groups = settingsGroups({ sections, workspaceName: undefined, place: "served" });
      expect(headings(groups).map((group) => group.heading)).toEqual([
        "In this browser",
        "On the computer running Halonic",
      ]);
    });

    it("leaves out a group with no sections", () => {
      const groups = settingsGroups({
        sections: [section("appearance", "display", 10)],
        workspaceName: "Acme",
        place: "served",
      });
      expect(headings(groups)).toEqual([{ heading: "In this browser", ids: ["appearance"] }]);
    });
  });
});

verifies("shell.settings-keyboard", () => {
  describe("rowAfterKey", () => {
    const groups = settingsGroups({ sections, workspaceName: "Acme", place: "app" });
    const order = listedSections(groups).map((listed) => listed.id);

    it("moves across the groups with ↓ and ↑", () => {
      expect(rowAfterKey(order, "developer", "ArrowDown")).toBe("models");
      expect(rowAfterKey(order, "models", "ArrowUp")).toBe("developer");
    });

    it("stays on the first and last row instead of wrapping", () => {
      expect(rowAfterKey(order, "appearance", "ArrowUp")).toBe("appearance");
      expect(rowAfterKey(order, "assistant", "ArrowDown")).toBe("assistant");
    });

    it("goes to the first and last row with Home and End, and ignores other keys", () => {
      expect(rowAfterKey(order, "trust", "Home")).toBe("appearance");
      expect(rowAfterKey(order, "models", "End")).toBe("assistant");
      expect(rowAfterKey(order, "models", "Enter")).toBeUndefined();
    });
  });
});

verifies("shell.settings-list-page", () => {
  it("puts a section's own headings one level under its name: h4 in the dialog, h2 on a phone", () => {
    expect(sectionHeadingLevel("window")).toBe(4);
    expect(sectionHeadingLevel(undefined)).toBe(4);
    expect(sectionHeadingLevel("phone")).toBe(2);
  });
});
