import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { SettingsScope, SettingsSectionContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { listedSections, type SettingsGroup, settingsGroups } from "./settings-groups.ts";
import { rowAfterKey } from "./settings-nav.tsx";

const load = async () => ({ View: () => "view" });

function section(
  id: string,
  scope: SettingsScope,
  order: number,
): Registered<SettingsSectionContribution> {
  return { id, title: id, scope, order, view: "View", load, featureId: id };
}

const sections = [
  section("assistant", "host", 30),
  section("appearance", "display", 10),
  section("trust", "workspace", 20),
  section("models", "workspace", 10),
  section("developer", "display", 90),
];

/** Each group as its heading and the ids under it, as the list reads them. */
function headings(groups: readonly SettingsGroup[]) {
  return groups.map((group) => ({
    heading: [group.name, group.detail].filter((part) => part !== undefined).join(", "),
    ids: group.sections.map((listed) => listed.id),
  }));
}

verifies("shell.settings-container", () => {
  describe("settingsGroups", () => {
    it("heads the workspace's group with its name, then puts both scopes under On this computer", () => {
      const groups = settingsGroups({ sections, workspaceName: "Acme", place: "app" });
      expect(headings(groups)).toEqual([
        { heading: "Acme, Workspace settings", ids: ["models", "trust"] },
        { heading: "On this computer", ids: ["appearance", "assistant", "developer"] },
      ]);
    });

    it("splits this computer's group in a browser: the browser's sections, then the host's", () => {
      const groups = settingsGroups({ sections, workspaceName: "Acme", place: "served" });
      expect(headings(groups)).toEqual([
        { heading: "Acme, Workspace settings", ids: ["models", "trust"] },
        { heading: "In this browser", ids: ["appearance", "developer"] },
        { heading: "On the computer running Halonic", ids: ["assistant"] },
      ]);
    });

    it("leaves out the workspace's group when no workspace is open", () => {
      const groups = settingsGroups({ sections, workspaceName: undefined, place: "app" });
      expect(headings(groups).map((group) => group.heading)).toEqual(["On this computer"]);
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
      expect(rowAfterKey(order, "trust", "ArrowDown")).toBe("appearance");
      expect(rowAfterKey(order, "appearance", "ArrowUp")).toBe("trust");
    });

    it("stays on the first and last row instead of wrapping", () => {
      expect(rowAfterKey(order, "models", "ArrowUp")).toBe("models");
      expect(rowAfterKey(order, "developer", "ArrowDown")).toBe("developer");
    });

    it("goes to the first and last row with Home and End, and ignores other keys", () => {
      expect(rowAfterKey(order, "assistant", "Home")).toBe("models");
      expect(rowAfterKey(order, "models", "End")).toBe("developer");
      expect(rowAfterKey(order, "models", "Enter")).toBeUndefined();
    });
  });
});
