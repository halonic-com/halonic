import type { SettingsScope, SettingsSectionContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { bySettingsGroup } from "../points/settings-sections.ts";

/** Where Settings shows: in the desktop app, or in a browser that the computer running Halonic serves. */
export type SettingsPlace = "app" | "served";

/** A group in the settings list: its heading and its sections, in the order they show. */
export interface SettingsGroup {
  /** Tells the groups apart: `workspace`, `computer`, or, when served, `browser` and `host`. */
  readonly key: string;
  /** The heading's name, written in sentence case: "Acme", "On this computer". */
  readonly name: string;
  /** The heading's second line, only on the workspace's group: "Workspace settings". */
  readonly detail?: string;
  readonly sections: readonly Registered<SettingsSectionContribution>[];
}

/** What the settings list needs to know about the window. */
export interface SettingsGroupsInput {
  /** The sections features added, as `shell.contributions.settings.list()` gives them. */
  readonly sections: readonly Registered<SettingsSectionContribution>[];
  /** The open workspace's name, or `undefined` when none is open: then its group isn't listed. */
  readonly workspaceName: string | undefined;
  readonly place: SettingsPlace;
}

const computerHeadings: Readonly<Record<SettingsPlace, Record<"display" | "host", string>>> = {
  app: { display: "On this computer", host: "On this computer" },
  served: { display: "In this browser", host: "On the computer running Halonic" },
};

/**
 * The settings list's groups (flow-settings 3, UX checklist 3.1). The workspace's group comes
 * first, headed by its name over "Workspace settings". In the desktop app the `display` and `host`
 * sections share one group, "On this computer". In a browser they are saved in different places,
 * so each gets its own group: "In this browser", then "On the computer running Halonic". A group
 * with no sections isn't listed, and with no workspace open its sections aren't either.
 *
 * @example
 * settingsGroups({ sections: shell.contributions.settings.list(), workspaceName: "Acme", place: "app" });
 * // [{ key: "workspace", name: "Acme", detail: "Workspace settings", … }, { key: "computer", name: "On this computer", … }]
 */
export function settingsGroups(input: SettingsGroupsInput): SettingsGroup[] {
  const sorted = bySettingsGroup(input.sections);
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
  if (input.place === "app") {
    groups.push({ key: "computer", name: headings.display, sections: inScope("display", "host") });
  } else {
    groups.push({ key: "browser", name: headings.display, sections: inScope("display") });
    groups.push({ key: "host", name: headings.host, sections: inScope("host") });
  }
  return groups.filter((group) => group.sections.length > 0);
}

/** The sections of all groups, in the order the list shows them, so ↑ and ↓ move across groups. */
export function listedSections(
  groups: readonly SettingsGroup[],
): Registered<SettingsSectionContribution>[] {
  return groups.flatMap((group) => group.sections);
}
