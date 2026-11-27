import type { MouseEvent, ReactNode } from "react";
import { WarningIcon } from "../icons/warning-icon.tsx";
import { StatusChip } from "../status-chip/status-chip.tsx";

/** The counter at a tab's icon: how many things wait in its view. */
export interface PhoneTabCount {
  readonly value: number;
  /** What the number means, read after the tab's name: "3 waiting" makes "Inbox, 3 waiting". */
  readonly name: string;
  /** `attention` counts problems: the number after a warning mark, in amber. `accent` by default. */
  readonly tone?: "accent" | "attention";
}

/** One view of the phone tab bar. */
export interface PhoneTab<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  /** The tab's 20px icon, filled while the tab is picked, as the place icons draw it. */
  readonly icon: (picked: boolean) => ReactNode;
  /** Shown only while its value is above 0. */
  readonly count?: PhoneTabCount;
  /**
   * The still running dot at the icon, while something in the view runs; its words are read after
   * the tab's name, such as "1 running". A count shows instead when the tab has one.
   */
  readonly running?: { readonly name: string };
  /**
   * Makes the tab a link to this address, so a screen reader lists it with the page's links, as
   * the shell's places are. The bar never follows it: a tap still calls `onSelect`.
   */
  readonly href?: string;
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
 * navigation. A count, or the running dot, sits at the icon's corner, and a screen reader hears
 * its words after the name.
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
        const signal = signalOf(tab);
        const select = (event: MouseEvent) => {
          event.preventDefault();
          onSelect(tab.id);
        };
        const content = (
          <>
            <TabPill picked={picked} signal={signal}>
              {tab.icon(picked)}
            </TabPill>
            <span
              className={`max-w-full truncate text-caption ${picked ? "text-fg" : "text-fg-muted"}`}
            >
              {tab.label}
            </span>
          </>
        );
        const target = {
          "aria-current": picked ? ("page" as const) : undefined,
          "aria-controls": controls,
          // The signal is drawn as a mark, so the name says it: "Inbox, 3 waiting".
          "aria-label": signal === undefined ? tab.label : `${tab.label}, ${signal.name}`,
          className:
            "group flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-1 focus-ring-inset",
          onClick: select,
        };
        return tab.href === undefined ? (
          <button key={tab.id} type="button" {...target}>
            {content}
          </button>
        ) : (
          // A middle-click picks the tab too, rather than opening the address in a new window.
          <a
            key={tab.id}
            href={tab.href}
            {...target}
            onAuxClick={(event) => {
              if (event.button === middleButton) select(event);
            }}
          >
            {content}
          </a>
        );
      })}
    </nav>
  );
}

const middleButton = 1;

/** What shows at a tab's icon: its count above 0, else its running dot, else nothing. */
type TabSignal =
  | (PhoneTabCount & { readonly kind: "count" })
  | { readonly kind: "running"; readonly name: string };

function signalOf(tab: PhoneTab): TabSignal | undefined {
  if (tab.count !== undefined && tab.count.value > 0) return { kind: "count", ...tab.count };
  return tab.running === undefined ? undefined : { kind: "running", name: tab.running.name };
}

/**
 * The 56×28px pill round the icon: the halo tint on the picked tab, `surface-muted` while another
 * is pressed. It's never wider than its tab, so at 195px (400 % zoom of a 780px window) four tabs'
 * 49px still hold it inside the window (HAL-13895). In forced colours the tint is gone, so every
 * pill gets a 1px edge and the picked one a 2px `Highlight` edge (VK T2-F14).
 */
function TabPill({
  picked,
  signal,
  children,
}: {
  readonly picked: boolean;
  readonly signal: TabSignal | undefined;
  readonly children: ReactNode;
}) {
  const fill = picked
    ? "bg-halo-tint text-accent forced-colors:border-2 forced-colors:border-[Highlight] forced-colors:text-[CanvasText]"
    : "text-fg-muted group-active:bg-surface-muted forced-colors:border forced-colors:border-[CanvasText]";
  // A count sits beside the icon, so the icon keeps room for it at its end and the pair is centred:
  // 6px, icon 20px, ring 2px, count 20px, ring 2px, 6px (HAL-19399 G13, Noah's check HAL-20644).
  const room = signal?.kind === "count" ? " me-6" : "";
  return (
    <span
      className={`flex h-7 w-14 max-w-full shrink-0 items-center justify-center rounded-full ${fill}`}
    >
      <span className={`relative size-icon-md *:size-full${room}`}>
        {children}
        {signal === undefined ? null : <IconSignal signal={signal} />}
      </span>
    </span>
  );
}

/**
 * A tab's signal. The count sits beside the icon, level with it, so it hides none of the icon and
 * stays inside the 56×28px pill, ring included (HAL-19399 G13, which moved it from component specs
 * 15.2 rev. 6's spot above the pill, then off the icon's corner after Noah's check HAL-20644). It
 * holds one or two digits; the box is the icon's 20px. The dot stays centred on the icon's top
 * right corner (15.2, rev. 6). Both have a 2px `surface` ring, and the count sits on a `surface`
 * backing so the pill doesn't show through its soft fill. The backing is a flex box, so the count
 * fills it rather than sitting on a text line's baseline: the ring stays even. The tab's name
 * already says it, so it's hidden here.
 */
function IconSignal({ signal }: { readonly signal: TabSignal }) {
  if (signal.kind === "running") {
    // Still, never breathing (UX settled values). In forced colours it keeps its fill.
    return (
      <span
        aria-hidden="true"
        className="absolute -end-0.75 -top-0.75 size-1.5 rounded-full bg-running ring-2 ring-surface forced-color-adjust-none forced-colors:bg-[CanvasText]"
      />
    );
  }
  const problems = signal.tone === "attention";
  return (
    <span
      aria-hidden="true"
      className="absolute -end-5.5 top-0 flex rounded-full bg-surface ring-2 ring-surface"
    >
      <StatusChip tone={problems ? "attention" : "accent"} shape="count" name={signal.name}>
        {problems ? (
          <span className="inline-flex items-center gap-0.5">
            <span className="inline-grid size-3 *:size-full">
              <WarningIcon />
            </span>
            {signal.value}
          </span>
        ) : (
          signal.value
        )}
      </StatusChip>
    </span>
  );
}
