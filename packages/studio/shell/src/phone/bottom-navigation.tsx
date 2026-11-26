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
