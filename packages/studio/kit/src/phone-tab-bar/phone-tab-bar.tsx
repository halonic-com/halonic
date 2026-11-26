import type { ReactNode } from "react";
import { StatusChip } from "../status-chip/status-chip.tsx";

/** The counter at a tab's icon: how many things wait in its view. */
export interface PhoneTabCount {
  readonly value: number;
  /** What the number means, read after the tab's name: "3 waiting" makes "Inbox, 3 waiting". */
  readonly name: string;
}

/** One view of the phone tab bar. */
export interface PhoneTab<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  /** The tab's 20px icon, filled while the tab is picked, as the place icons draw it. */
  readonly icon: (picked: boolean) => ReactNode;
  /** Shown only while its value is above 0. */
  readonly count?: PhoneTabCount;
}

/** The props of `PhoneTabBar`. */
export interface PhoneTabBarProps<Id extends string = string> {
  /** The bar's name for a screen reader, such as the computer the views belong to. */
  readonly label: string;
  readonly tabs: readonly PhoneTab<Id>[];
  readonly selected: Id;
  readonly onSelect: (id: Id) => void;
  /** The id of the element that shows the picked view, which each tab controls. */
  readonly controls?: string;
}

/**
 * A phone screen's own views in a bar at the bottom (HAL-17514 p02a): a `nav` with a `border` line
 * on top, at least 56px plus the home bar's inset, its tabs sharing the width equally, each a 20px
 * icon over its label, and the whole tab the target. The picked tab is `aria-current="page"`: the
 * filled icon in `accent` on a 56×28px halo pill and the label in `fg`, as the shell's bottom
 * navigation. A count sits at the icon's corner, and a screen reader hears it after the name.
 *
 * Use it for the views of one thing on a phone, such as a paired computer's Inbox and Agents; the
 * kit's `Tabs` is the row of a page's own views at the top.
 *
 * @example
 * <PhoneTabBar label="Tim's laptop" tabs={tabs} selected="inbox" onSelect={setTab} />
 */
export function PhoneTabBar<Id extends string>({
  label,
  tabs,
  selected,
  onSelect,
  controls,
}: PhoneTabBarProps<Id>) {
  return (
    <nav
      aria-label={label}
      className="relative z-(--layer-sticky) flex min-h-phone-bar shrink-0 border-t border-border bg-surface pb-safe-inset"
    >
      {tabs.map((tab) => {
        const picked = tab.id === selected;
        const count = tab.count !== undefined && tab.count.value > 0 ? tab.count : undefined;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={picked ? "page" : undefined}
            aria-controls={controls}
            className="group flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-1 focus-ring-inset"
            onClick={() => onSelect(tab.id)}
          >
            <TabPill picked={picked} count={count}>
              {tab.icon(picked)}
            </TabPill>
            <span
              className={`max-w-full truncate text-caption ${picked ? "text-fg" : "text-fg-muted"}`}
            >
              {tab.label}
            </span>
            {count === undefined ? null : <span className="sr-only">, {count.name}</span>}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * The 56×28px pill round the icon: the halo tint on the picked tab, `surface-muted` while another
 * is pressed. In forced colours the tint is gone, so every pill gets a 1px edge and the picked one
 * a 2px `Highlight` edge, as the shell's bottom navigation.
 */
function TabPill({
  picked,
  count,
  children,
}: {
  readonly picked: boolean;
  readonly count: PhoneTabCount | undefined;
  readonly children: ReactNode;
}) {
  const fill = picked
    ? "bg-halo-tint text-accent forced-colors:border-2 forced-colors:border-[Highlight] forced-colors:text-[CanvasText]"
    : "text-fg-muted group-active:bg-surface-muted forced-colors:border forced-colors:border-[CanvasText]";
  return (
    <span
      className={`flex h-7 w-14 max-w-full shrink-0 items-center justify-center rounded-full ${fill}`}
    >
      <span className="relative size-icon-md *:size-full">
        {children}
        {count === undefined ? null : (
          // The tab's name already says it, after the label, so the chip is hidden here.
          <span
            aria-hidden="true"
            className="absolute start-3.5 -top-2 rounded-full bg-surface ring-2 ring-surface"
          >
            <StatusChip tone="accent" shape="count" name={count.name}>
              {count.value}
            </StatusChip>
          </span>
        )}
      </span>
    </span>
  );
}
