import {
  ChevronDownIcon,
  headerBadgeMenuClasses,
  Menu,
  type MenuItem,
  type MenuTriggerProps,
} from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { currentLocation, type TabLocation, type TabSet, type TabSetState } from "./tab-set.ts";

/** Props for {@link OpenTabsMenu}. */
export interface OpenTabsMenuProps {
  readonly tabs: TabSet;
  /** The tab set's state now, which the strip already follows. */
  readonly state: TabSetState;
  readonly iconFor?: ((location: TabLocation) => ReactNode) | undefined;
  readonly needsYou?: ((location: TabLocation) => boolean) | undefined;
}

/**
 * The narrow window's window tabs (600 to 899px, component specs 24.5 T5, VK T2-F43): folded into
 * one header badge, "3 open tabs ▾", right after the logo and centred in the title bar. It counts
 * every open tab and never hides: one tab reads "1 open tab ▾". When a tab needs you, the still
 * 6px `warning` dot comes before the ▾, and the name says how many: "3 open tabs, 1 needs you".
 *
 * It opens a Menu of the open tabs from its left edge, 4px below: each tab's icon and name, the
 * needs-you dot, and the active one checked. A pick makes that tab active, and its page takes the
 * focus back, as after a switch from the sidebar.
 */
export function OpenTabsMenu({ tabs, state, iconFor, needsYou }: OpenTabsMenuProps) {
  const waiting = state.tabs.filter((tab) => needsYou?.(currentLocation(tab)) ?? false).length;
  const words = openTabsWords(state.tabs.length);
  const entries = state.tabs.map((tab): MenuItem => {
    const location = currentLocation(tab);
    return {
      id: tab.id,
      label: location.title,
      icon: iconFor?.(location),
      checked: tab.id === state.activeId,
      attention: needsYou?.(location) === true ? "needs you" : undefined,
      onSelect: () => tabs.activate(tab.id),
    };
  });

  return (
    <div className="shrink-0 self-center">
      <Menu
        entries={entries}
        trigger={(trigger: MenuTriggerProps) => (
          <button
            type="button"
            {...trigger}
            aria-label={waiting > 0 ? `${words}, ${needYouWords(waiting)}` : undefined}
            className={headerBadgeMenuClasses}
          >
            <span>{words}</span>
            {waiting > 0 ? (
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-warning forced-color-adjust-none"
              />
            ) : null}
            <span aria-hidden="true" className="inline-grid size-3.5 shrink-0 *:size-full">
              <ChevronDownIcon />
            </span>
          </button>
        )}
      />
    </div>
  );
}

/** "1 open tab", "3 open tabs". */
function openTabsWords(count: number): string {
  return count === 1 ? "1 open tab" : `${count} open tabs`;
}

/** "1 needs you", "2 need you". */
function needYouWords(count: number): string {
  return count === 1 ? "1 needs you" : `${count} need you`;
}
