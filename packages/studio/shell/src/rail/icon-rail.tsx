import {
  DashedRingIcon,
  PlaceIcon,
  type PlaceIconName,
  placeIconNames,
  RailButton,
  SettingsIcon,
} from "@halonicjs/studio-kit";
import { useCallback, useSyncExternalStore } from "react";
import type { Registered } from "../points/point-store.ts";
import type { RailEntry } from "../points/rail.ts";
import { usePageHeadingFocus } from "../tabs/history-moves.ts";
import { currentLocation, type TabSet } from "../tabs/tab-set.ts";
import type { RailColumn } from "./rail-column.ts";
import { RailDot } from "./rail-dot.tsx";
import { type PlaceOfKind, selectedRailEntry } from "./rail-selection.ts";

/** Props for {@link IconRail}. */
export interface IconRailProps {
  /** The entries to show: `shell.contributions.rail.shown(facts, kept)`. Settings goes last. */
  readonly entries: readonly Registered<RailEntry>[];
  /**
   * The open workspace's tabs: a click opens there, and the active tab says which entry is
   * selected.
   */
  readonly tabs: TabSet;
  /** The place an item kind registers: `(kind) => contributions.itemKinds.get(kind)?.place`. */
  readonly placeOfKind: PlaceOfKind;
  /** Opens the Settings dialog: the window's `openSettings`. Without it, Settings isn't shown. */
  readonly onSettings?: (() => void) | undefined;
  /**
   * The window's selection, `useRailColumn`, when the list column follows the rail too: a click
   * picks the entry, so one with no page yet still shows as selected. Left out, the active tab
   * alone says which entry is selected.
   */
  readonly column?: RailColumn | undefined;
}

/**
 * The icon rail on the window's left edge (`shell.rail`, build plan P3 on HAL-20617): a 64px
 * column on the frame, one `RailButton` per entry, 4px apart, the first level with the framed
 * panel's top and Settings apart at the bottom, 10px above the window's edge with the frame's 8px
 * (the approved mockup, v26 on HAL-20617). The entry that holds the active tab is selected, so
 * the selection follows a tab click, Back, a search result or a link as well as a click here. A
 * click opens the entry's page in the active tab and moves the focus to the page's `h1`; a click
 * on the selected entry, or on one with no page yet, leaves the tab as it is. Settings opens its dialog over the page and is never selected. The one white
 * dot rests on the selected entry and travels to a newly selected one (`RailDot`).
 *
 * Ctrl-click, Cmd-click and middle-click into a new tab, and links in place of buttons, come with
 * the frame (P3 PR 2b), once the kit's `RailButton` reports how it was clicked.
 *
 * @example
 * <IconRail entries={shell.contributions.rail.shown(facts)} tabs={workspace.tabs}
 *   placeOfKind={(kind) => contributions.itemKinds.get(kind)?.place} onSettings={openSettings} />
 */
export function IconRail({ entries, tabs, placeOfKind, onSettings, column }: IconRailProps) {
  const subscribe = useCallback((listener: () => void) => tabs.subscribe(listener), [tabs]);
  useSyncExternalStore(subscribe, () => tabs.state);
  const focusNewPage = usePageHeadingFocus();
  const tabEntry = selectedRailEntry(entries, currentLocation(tabs.active), placeOfKind);
  const selected = column === undefined ? tabEntry : column.selected;
  const apps = entries.filter((entry) => entry.id !== "settings");
  const settings = entries.find((entry) => entry.id === "settings");

  const open = (entry: RailEntry) => {
    column?.pick(entry);
    // On an item the entry holds, the tab stays on it (HAL-20673 rail flows, line 32).
    if (entry.opens === undefined || entry.id === selected) return;
    tabs.openHere({ key: entry.opens, title: entry.label });
    focusNewPage();
  };

  return (
    <nav
      aria-label="Apps"
      data-icon-rail=""
      className="relative flex h-full w-(--spacing-rail) shrink-0 flex-col items-center gap-1 pb-0.5"
    >
      <ul className="flex flex-col items-center gap-1">
        {apps.map((entry) => (
          <li key={entry.id}>
            <RailButton
              label={entry.label}
              icon={(isSelected) => <RailIcon name={entry.icon} selected={isSelected} />}
              selected={entry.id === selected}
              onSelect={() => open(entry)}
            />
          </li>
        ))}
      </ul>
      {settings === undefined || onSettings === undefined ? null : (
        <div className="mt-auto">
          <RailButton
            label={settings.label}
            icon={() => <SettingsIcon />}
            selected={false}
            onSelect={onSettings}
          />
        </div>
      )}
      <RailDot selected={selected} layout={apps.map((entry) => entry.id).join(" ")} />
    </nav>
  );
}

/**
 * An entry's drawing: a place's own icon, filled while selected. Code and Messenger have no
 * drawing in the kit yet (the new icons, HAL-20465), so they show the dashed ring until then.
 */
function RailIcon({ name, selected }: { readonly name: string; readonly selected: boolean }) {
  if (isPlaceIconName(name)) return <PlaceIcon name={name} filled={selected} />;
  return <DashedRingIcon />;
}

function isPlaceIconName(name: string): name is PlaceIconName {
  return (placeIconNames as readonly string[]).includes(name);
}
