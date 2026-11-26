import { MenuIcon, type PhoneTab, PhoneTabBar, PlaceIcon } from "@halonicjs/studio-kit";
import type { PlaceSignal, ShownPlace } from "../points/frame.ts";

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
 * The phone's bottom navigation (component specs 15.2, VK T2-F11): the kit's `PhoneTabBar`, a
 * `nav` named "Places" at the bottom of the screen, its items Home, Inbox, Runs and More. Each is
 * a link, so a screen reader lists it with the page's links; the shell opens the place itself, so
 * the browser never follows the address.
 *
 * Where you are is `aria-current="page"`. Inbox carries its count and Runs the still running dot,
 * at the icon's corner; a screen reader hears them after the name ("Inbox, 3 waiting"). More
 * carries nothing and always shows, because the workspace switcher lives there.
 *
 * @example
 * <BottomNavigation places={shownPlaces} current="inbox" onSelect={switchPlace} />
 */
export function BottomNavigation({ places, current, onSelect }: BottomNavigationProps) {
  return (
    <PhoneTabBar
      label="Places"
      tabs={navigationTabs(places)}
      selected={current}
      onSelect={onSelect}
    />
  );
}

/** Home, Inbox and Runs as the features added them, then More, which is always there. */
function navigationTabs(places: readonly ShownPlace[]): readonly PhoneTab<BottomNavigationPlace>[] {
  const shown = (["home", "inbox", "runs"] as const).flatMap((id) => {
    const place = places.find((candidate) => candidate.id === id);
    if (place === undefined) {
      return [];
    }
    const tab: PhoneTab<BottomNavigationPlace> = {
      id,
      label: place.label,
      href: `#${id}`,
      icon: (filled) => <PlaceIcon name={id} filled={filled} />,
      ...signalOf(place.signal),
    };
    return [tab];
  });
  return [...shown, moreTab];
}

/** A place's signal as the tab bar shows it: a count, problems after the warning mark, or the dot. */
function signalOf(signal: PlaceSignal | undefined): Pick<PhoneTab, "count" | "running"> {
  if (signal === undefined) return {};
  if (signal.mark === "running") return { running: { name: signal.spoken } };
  const tone = signal.mark === "problems" ? "attention" : "accent";
  return { count: { value: signal.value, name: signal.spoken, tone } };
}

// More is the menu's three lines in both looks (VK T2-F11); it has no filled drawing.
const moreTab: PhoneTab<BottomNavigationPlace> = {
  id: "more",
  label: "More",
  href: "#more",
  icon: () => <MenuIcon />,
};
<<<<<<< HEAD
=======

interface NavigationPillProps {
  readonly current: boolean;
  readonly signal: PlaceSignal | undefined;
  readonly children: ReactNode;
}

/**
 * The 56×28px pill round the icon: the halo tint where you are, `surface-muted` while pressed
 * elsewhere. It's never wider than its item, so at 195px (400 % zoom of a 780px window) the four
 * items' 49px still hold it inside the window (HAL-13895). In forced colours the tint is gone, so
 * every pill gets a 1px edge and where you are a 2px `Highlight` one (VK T2-F14).
 */
function NavigationPill({ current, signal, children }: NavigationPillProps) {
  const fill = current
    ? "bg-halo-tint text-accent forced-colors:border-2 forced-colors:border-[Highlight] forced-colors:text-[CanvasText]"
    : "text-fg-muted group-active:bg-surface-muted forced-colors:border forced-colors:border-[CanvasText]";
  return (
    <span
      className={`flex h-7 w-14 max-w-full shrink-0 items-center justify-center rounded-full ${fill}`}
    >
      <span className="relative size-icon-md *:size-full">
        {children}
        {signal === undefined ? null : <IconSignal signal={signal} />}
      </span>
    </span>
  );
}

/**
 * A signal at the icon's corner (component specs 15.2, rev. 6): the count's right edge and top
 * 2px inside the 56×28px pill, ring included, so however wide the count, it stays inside the
 * current place's filled pill (HAL-19399 G13); the dot centred on the icon's top right
 * corner. Both have a 2px `surface` ring, and the count sits on a `surface` backing so the pill
 * doesn't show through its soft fill. The link's name already says it, so it's hidden here.
 */
function IconSignal({ signal }: { readonly signal: PlaceSignal }) {
  if (signal.mark !== "running") {
    return (
      <span
        aria-hidden="true"
        className="absolute -end-3.5 -top-0.5 rounded-full bg-surface ring-2 ring-surface"
      >
        <SignalCount signal={signal} />
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
>>>>>>> 4607bf588 (feat(studio): first-run polish from the 0.2.0 walk-through (HAL-19399))
