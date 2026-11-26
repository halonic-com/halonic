import {
  type SettingsGroupName,
  type SettingsScope,
  type SettingsSectionContribution,
  settingsGroupNames,
} from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { bySettingsGroup } from "../points/settings-sections.ts";

/** Where Settings shows: in the desktop app, or in a browser that the computer running Halonic serves. */
export type SettingsPlace = "app" | "served";

/**
 * What a section's view is drawn on: the Settings dialog of a window, or the phone's own Settings
 * page (flow-settings 13, mc 13.2). The shell says which, so a section never guesses from the width.
 */
export type SettingsSurface = "window" | "phone";

/** A group in the settings list: its heading and its sections, in the order they show. */
export interface SettingsGroup {
  /**
   * Tells the groups apart: `workspace`, `computer`, or, when served, `browser` and `host`; in the
   * desktop app's dialog, the {@link SettingsGroupName}.
   */
  readonly key: string;
  /** The heading's name, written in sentence case: "Acme", "On this computer", "General". */
  readonly name: string;
  /** The heading's second line, only on the workspace's group: "Workspace settings". */
  readonly detail?: string;
  /**
   * The group's name isn't drawn: a hairline sets it apart from the group before it, and screen
   * readers hear the name as the group's label. The desktop app's dialog groups are drawn so,
   * because a heading over a one-row group ("Keyboard" over Keyboard) only repeats the row.
   */
  readonly divider?: true;
  readonly sections: readonly Registered<SettingsSectionContribution>[];
}

/** What the settings list needs to know about the window. */
export interface SettingsGroupsInput {
  /** The sections features added, as `shell.contributions.settings.list()` gives them. */
  readonly sections: readonly Registered<SettingsSectionContribution>[];
  /** The open workspace's name, or `undefined` when none is open: then its sections aren't listed. */
  readonly workspaceName: string | undefined;
  readonly place: SettingsPlace;
  /**
   * The list is a phone's page: Developer and any section with `phone: false` are left out,
   * and, when served, the headings read "On this phone" and "On your computer" (flow-settings 13).
   * In the desktop app, in a narrow window, the headings stay "On this computer".
   */
  readonly phone?: boolean;
}

const computerHeadings: Readonly<Record<SettingsPlace, Record<"display" | "host", string>>> = {
  app: { display: "On this computer", host: "On this computer" },
  served: { display: "In this browser", host: "On the computer running Halonic" },
};

/** What screen readers hear for each of the desktop app's dialog groups. */
const groupNames: Readonly<Record<SettingsGroupName, string>> = {
  general: "General",
  agents: "Agents",
  connections: "Account and connections",
  keyboard: "Keyboard",
  about: "About",
};

/**
 * The settings list's groups (flow-settings 3, UX checklist 3.1). In the desktop app's dialog the
 * sections are grouped by what they are about (`shell.settings-dialog-groups`): General, Agents,
 * Account and connections, Keyboard and About, in that order, each set apart by a hairline rather
 * than a heading. Elsewhere they are grouped by where their values are saved: the workspace's
 * group first, headed by its name over "Workspace settings"; then, on a phone in the desktop app,
 * "On this computer"; in a browser, where the two are saved in different places, "In this
 * browser", then "On the computer running Halonic". A group with no sections isn't listed, and
 * with no workspace open its sections aren't either.
 *
 * @example
 * settingsGroups({ sections: shell.contributions.settings.list(), workspaceName: "Acme", place: "served" });
 * // [{ key: "workspace", name: "Acme", detail: "Workspace settings", … }, { key: "browser", name: "In this browser", … }, …]
 */
export function settingsGroups(input: SettingsGroupsInput): SettingsGroup[] {
  const sorted = bySettingsGroup(
    input.phone === true
      ? input.sections.filter((section) => section.phone !== false)
      : input.sections,
  );
  if (input.place === "app" && input.phone !== true) {
    return dialogGroups(sorted, input.workspaceName !== undefined);
  }
  const inScope = (...scopes: SettingsScope[]) =>
    sorted.filter((section) => scopes.includes(section.scope));
  const headings = computerHeadings[input.place];
  const groups: SettingsGroup[] = [];
  if (input.workspaceName !== undefined) {
    groups.push({
      key: "workspace",
      name: input.workspaceName,
      detail: "Workspace settings",
      sections: inScope("workspace"),
    });
  }
  if (input.phone === true && input.place === "served") {
    groups.push({ key: "phone", name: "On this phone", sections: inScope("display") });
    groups.push({ key: "host", name: "On your computer", sections: inScope("host") });
  } else if (input.place === "app") {
    groups.push({ key: "computer", name: headings.display, sections: inScope("display", "host") });
  } else {
    groups.push({ key: "browser", name: headings.display, sections: inScope("display") });
    groups.push({ key: "host", name: headings.host, sections: inScope("host") });
  }
  return groups.filter((group) => group.sections.length > 0);
}

/**
 * The desktop app dialog's groups, in {@link settingsGroupNames}' order, each section by `order`
 * within its group. A workspace's sections are left out while no workspace is open.
 */
function dialogGroups(
  sorted: readonly Registered<SettingsSectionContribution>[],
  workspaceOpen: boolean,
): SettingsGroup[] {
  const shown = sorted.filter((section) => workspaceOpen || section.scope !== "workspace");
  return settingsGroupNames
    .map((key): SettingsGroup => {
      const sections = shown
        .filter((section) => section.group === key)
        .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
      return { key, name: groupNames[key], divider: true, sections };
    })
    .filter((group) => group.sections.length > 0);
}

/** The sections of all groups, in the order the list shows them, so ↑ and ↓ move across groups. */
export function listedSections(
  groups: readonly SettingsGroup[],
): Registered<SettingsSectionContribution>[] {
  return groups.flatMap((group) => group.sections);
}
