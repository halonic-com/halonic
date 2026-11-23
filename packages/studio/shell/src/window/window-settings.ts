import { type RefObject, useCallback } from "react";
import type { StudioHost } from "../engine/engine-words.ts";
import { settingsLocation } from "../phone/place-stacks.ts";
import { sectionLocation } from "../phone/settings-list-page.tsx";
import type { SettingsSectionContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { listedSections, settingsGroups } from "../settings/settings-groups.ts";
import type { TabLocation } from "../tabs/tab-set.ts";

/** What {@link useOpenSettings} needs from the window. */
export interface OpenSettingsOptions {
  /** Whether the window is a desktop one, read when Settings opens. */
  readonly onDesktop: RefObject<boolean>;
  /** Shows the Settings dialog on the desktop. */
  readonly showDialog: (sectionId?: string) => void;
  /** Opens a page on the phone's More stack. */
  readonly openPhone: (location: TabLocation, options?: { readonly list?: boolean }) => void;
  /** Where the phone's Settings list was scrolled to; opening Settings starts it at the top. */
  readonly scroll: RefObject<number>;
  readonly sections: readonly Registered<SettingsSectionContribution>[];
  readonly workspaceName: string | undefined;
  readonly host: StudioHost;
}

/**
 * Opens Settings on the section asked for: a dialog on the desktop and a page on the More stack
 * below 600px (flow-settings 13). It reads the layout when it opens, so the context that holds it
 * stays the same as the window narrows or widens. On a phone it opens a section only when the
 * phone's list shows it, so a link can't open one the list leaves out.
 */
export function useOpenSettings(options: OpenSettingsOptions): (sectionId?: string) => void {
  const { onDesktop, showDialog, openPhone, scroll, sections, workspaceName, host } = options;
  return useCallback(
    (sectionId?: string) => {
      if (onDesktop.current) {
        showDialog(sectionId);
        return;
      }
      scroll.current = 0;
      openPhone(settingsLocation, { list: true });
      const section =
        sectionId === undefined
          ? undefined
          : listedSections(
              settingsGroups({
                sections,
                workspaceName,
                place: host === "desktop-app" ? "app" : "served",
                phone: true,
              }),
            ).find((candidate) => candidate.id === sectionId);
      if (section !== undefined) {
        openPhone(sectionLocation(section));
      }
    },
    [onDesktop, showDialog, openPhone, scroll, sections, workspaceName, host],
  );
}
