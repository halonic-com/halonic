import { ChevronRightIcon, List, type ListRow } from "@halonicjs/studio-kit";
import type { SettingsSectionContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { listedSections, type SettingsPlace, settingsGroups } from "../settings/settings-groups.ts";
import type { TabLocation } from "../tabs/tab-set.ts";

/** Props for {@link SettingsListPage}. */
export interface SettingsListPageProps {
  /** The sections features added, as `shell.contributions.settings.list()` gives them. */
  readonly sections: readonly Registered<SettingsSectionContribution>[];
  /** The open workspace's name, or `undefined` when none is open. */
  readonly workspaceName: string | undefined;
  readonly place: SettingsPlace;
  /** A row's tap. The caller opens the section's page above this one (`sectionLocation`). */
  readonly onOpen: (section: Registered<SettingsSectionContribution>) => void;
}

/** The location of a Settings section's page on the phone: `settings/<id>`, under the list's. */
export function sectionLocation(section: {
  readonly id: string;
  readonly title: string;
}): TabLocation {
  return { key: `settings/${section.id}`, title: section.title };
}

/** The section id a phone page key opens, or `undefined` when the key is not a section's page. */
export function sectionIdOfLocationKey(key: string): string | undefined {
  return key.startsWith("settings/") ? key.slice("settings/".length) : undefined;
}

/**
 * The phone's Settings list page (flow-settings 13, `shell.settings-list-page`): a flush List of
 * the sections the window has, in the order the desktop's Settings lists them, each a 56px row with
 * a chevron. A tap passes the section on, and the caller opens it as the next page on the More
 * stack. The top bar already says "Settings", so the page's `h1` is for screen readers only.
 *
 * @example
 * <SettingsListPage sections={shell.contributions.settings.list()} workspaceName="Acme" place="served"
 *   onOpen={(section) => phone.open(sectionLocation(section))} />
 */
export function SettingsListPage({
  sections,
  workspaceName,
  place,
  onOpen,
}: SettingsListPageProps) {
  const listed = listedSections(settingsGroups({ sections, workspaceName, place }));
  const rows: readonly ListRow[] = listed.map((section) => ({
    id: section.id,
    title: section.title,
    trailing: (
      <span aria-hidden="true" className="size-icon-md text-fg-subtle *:size-full">
        <ChevronRightIcon />
      </span>
    ),
  }));
  return (
    <div className="flex flex-col">
      <h1 tabIndex={-1} className="sr-only">
        Settings
      </h1>
      <List
        label="Settings"
        rows={rows}
        flush
        onOpen={(id) => {
          const section = listed.find((candidate) => candidate.id === id);
          if (section !== undefined) {
            onOpen(section);
          }
        }}
      />
    </div>
  );
}
