import { MenuIcon, PlaceIcon, StatusChip } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { PlaceSignal, ShownPlace } from "../points/frame.ts";
import { LocationLink } from "../tabs/location-link.tsx";

/** One of the bottom navigation's four items, in its order (component specs 15.2). */
export type BottomNavigationPlace = "home" | "inbox" | "runs" | "more";

/** Props for {@link BottomNavigation}. */
export interface BottomNavigationProps {
  /**
   * The places the features added, from `showPlace`, as the sidebar gets them. Home, Inbox and
   * Runs show only when they are among them; the rest live under More.
   */
  readonly places: readonly ShownPlace[];
  /** The phone place the user is in: on a list under More, it's More. */
  readonly current: BottomNavigationPlace;
  /** A tap. The caller switches places, or goes to the top of the place already shown. */
  readonly onSelect: (place: BottomNavigationPlace) => void;
}

/**
 * The phone's bottom navigation (component specs 15.2, VK T2-F11): a `nav` named "Places" at the
 * bottom of the screen, at least 56px plus the home bar's inset, with a `border` line on top. Its
 * items are Home, Inbox, Runs and More, sharing the width equally, each a 20px icon over its
 * label, and the whole item is the target.
 *
 * Where you are is `aria-current="page"`: the filled icon in `accent` on a 56×28px halo pill, the
 * label in `fg`. Inbox carries its count and Runs the still running dot, at the
 * icon's corner; a screen reader hears them after the name ("Inbox, 3 waiting"). More carries
 * nothing and always shows, because the workspace switcher lives there.
 *
 * @example
 * <BottomNavigation places={shownPlaces} current="inbox" onSelect={switchPlace} />
 */
export function BottomNavigation({ places, current, onSelect }: BottomNavigationProps) {
  const items = navigationItems(places);
  return (
    <nav
      aria-label="Places"
      className="relative z-(--layer-sticky) flex min-h-phone-bar shrink-0 border-t border-border bg-surface pb-safe-inset"
    >
      {items.map((item) => (
        <LocationLink
          key={item.id}
          location={{ key: item.id, title: item.label }}
          onOpen={() => onSelect(item.id)}
          current={item.id === current}
          label={item.spokenName}
          className="group flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-1 focus-ring-inset"
        >
          <NavigationPill current={item.id === current} signal={item.signal}>
            {item.icon(item.id === current)}
          </NavigationPill>
          <span className={labelClasses(item.id === current)}>{item.label}</span>
        </LocationLink>
      ))}
    </nav>
  );
}

interface NavigationItem {
  readonly id: BottomNavigationPlace;
  readonly label: string;
  readonly spokenName: string;
  readonly signal: PlaceSignal | undefined;
  readonly icon: (filled: boolean) => ReactNode;
}

/** Home, Inbox and Runs as the features added them, then More, which is always there. */
function navigationItems(places: readonly ShownPlace[]): readonly NavigationItem[] {
  const shown = (["home", "inbox", "runs"] as const).flatMap((id) => {
    const place = places.find((candidate) => candidate.id === id);
    if (place === undefined) {
      return [];
    }
    const item: NavigationItem = {
      id,
      label: place.label,
      spokenName: place.spokenName,
      signal: place.signal,
      icon: (filled) => <PlaceIcon name={id} filled={filled} />,
    };
    return [item];
  });
  return [...shown, moreItem];
}

// More is the menu's three lines in both looks (VK T2-F11); it has no filled drawing.
const moreItem: NavigationItem = {
  id: "more",
  label: "More",
  spokenName: "More",
  signal: undefined,
  icon: () => <MenuIcon />,
};

interface NavigationPillProps {
  readonly current: boolean;
  readonly signal: PlaceSignal | undefined;
  readonly children: ReactNode;
}

/**
 * The 56×28px pill round the icon: the halo tint where you are, `surface-muted` while pressed
 * elsewhere. In forced colours the tint is gone, so every pill gets a 1px edge and where you are a
 * 2px `Highlight` one (VK T2-F14).
 */
function NavigationPill({ current, signal, children }: NavigationPillProps) {
  const fill = current
    ? "bg-halo-tint text-accent forced-colors:border-2 forced-colors:border-[Highlight] forced-colors:text-[CanvasText]"
    : "text-fg-muted group-active:bg-surface-muted forced-colors:border forced-colors:border-[CanvasText]";
  return (
    <span className={`flex h-7 w-14 shrink-0 items-center justify-center rounded-full ${fill}`}>
      <span className="relative size-icon-md *:size-full">
        {children}
        {signal === undefined ? null : <IconSignal signal={signal} />}
      </span>
    </span>
  );
}

/**
 * A signal at the icon's corner (component specs 15.2, rev. 6): the count's left edge 4px right
 * of the icon's centre and its top 4px above the pill; the dot centred on the icon's top right
 * corner. Both have a 2px `surface` ring, and the count sits on a `surface` backing so the pill
 * doesn't show through its soft fill. The link's name already says it, so it's hidden here.
 */
function IconSignal({ signal }: { readonly signal: PlaceSignal }) {
  if (signal.mark === "count") {
    return (
      <span
        aria-hidden="true"
        className="absolute start-3.5 -top-2 rounded-full bg-surface ring-2 ring-surface"
      >
        <StatusChip tone="accent" shape="count" name={signal.spoken}>
          {signal.value}
        </StatusChip>
      </span>
    );
  }
  // Still, never breathing (UX settled values). In forced colours it keeps its fill.
  return (
    <span
      aria-hidden="true"
      className="absolute -end-0.75 -top-0.75 size-1.5 rounded-full bg-running ring-2 ring-surface forced-color-adjust-none forced-colors:bg-[CanvasText]"
    />
  );
}

function labelClasses(current: boolean): string {
  // `text-caption` is already weight 500, as the spec asks for where you are.
  return `max-w-full truncate text-caption ${current ? "text-fg" : "text-fg-muted"}`;
}
