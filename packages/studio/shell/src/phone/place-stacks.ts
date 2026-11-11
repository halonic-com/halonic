import { isSidebarPlace, placeNames, type SidebarPlace } from "../points/frame.ts";
import { homeLocation, type TabLocation } from "../tabs/tab-set.ts";

/** The phone's four places, in the bottom navigation's order (component specs 15.2). */
export const phonePlaces = ["home", "inbox", "runs", "more"] as const;

/** One of the phone's four places. */
export type PhonePlace = (typeof phonePlaces)[number];

/** The page at the top of each place's stack: the place itself. */
export const phonePlaceTops: Readonly<Record<PhonePlace, TabLocation>> = {
  home: homeLocation,
  inbox: { key: "inbox", title: placeNames.inbox.label },
  runs: { key: "runs", title: placeNames.runs.label },
  more: { key: "more", title: "More" },
};

/**
 * Settings on a phone: not a sidebar place (on a desktop it opens as a dialog), but a list under
 * More next to Agents, Workflows, Routines, Library and Changes (component specs 15.2).
 */
export const settingsLocation: TabLocation = { key: "settings", title: "Settings" };

/** A page in a place's stack. */
export interface PhonePage {
  readonly location: TabLocation;
  /**
   * Whether the page is still a list of kinds or items, not an opened item, so the bottom
   * navigation stays: the place itself, the lists under More, the Library's kind lists.
   */
  readonly list: boolean;
  /** Set on a page a link opened from another place, so Back goes back to that place. */
  readonly from?: PhonePlace;
}

/**
 * Where the phone is: the place shown and each place's own stack, its top page first (phone
 * layout 2). A stack is never empty. The functions below take one and return the next, or the
 * same one when nothing changed, so React can compare by identity.
 */
export interface PlaceStacks {
  readonly place: PhonePlace;
  readonly stacks: Readonly<Record<PhonePlace, readonly PhonePage[]>>;
}

/** How to open a page. */
export interface PhoneOpenOptions {
  /** The page is still a list, so the bottom navigation stays; see {@link PhonePage.list}. */
  readonly list?: boolean;
}

/** The phone at the start: on Home, every place at its top. */
export function startPlaceStacks(): PlaceStacks {
  const top = (place: PhonePlace): readonly PhonePage[] => [
    { location: phonePlaceTops[place], list: true },
  ];
  return {
    place: "home",
    stacks: { home: top("home"), inbox: top("inbox"), runs: top("runs"), more: top("more") },
  };
}

/** The page shown now. */
export function currentPhonePage(stacks: PlaceStacks): PhonePage {
  const stack = stacks.stacks[stacks.place];
  return stack[stack.length - 1] as PhonePage;
}

/** Whether the shown page is its place's top, where the top bar has no Back button. */
export function isAtPlaceTop(stacks: PlaceStacks): boolean {
  return stacks.stacks[stacks.place].length === 1;
}

/**
 * Whether the bottom navigation shows: on a place and on a list, never on an opened item, so the
 * item's page owns the bottom edge (component specs 0.2, "one bar at a time").
 */
export function showsBottomNavigation(stacks: PlaceStacks): boolean {
  return currentPhonePage(stacks).list;
}

/**
 * The phone place a sidebar place lives in: Home, Inbox and Runs are their own; Agents,
 * Workflows, Routines, Library and Changes are lists under More.
 */
export function phonePlaceOf(place: SidebarPlace): PhonePlace {
  return place === "home" || place === "inbox" || place === "runs" ? place : "more";
}

/**
 * A tap in the bottom navigation. Another place shows where the user left it; the place already
 * shown goes back to its top.
 */
export function switchPhonePlace(stacks: PlaceStacks, place: PhonePlace): PlaceStacks {
  if (place !== stacks.place) {
    return { ...stacks, place };
  }
  return isAtPlaceTop(stacks) ? stacks : withStack(stacks, place, topOf(stacks, place));
}

/**
 * Opens a page in the place shown, on top of its stack. A sidebar place opens where it lives
 * instead: Inbox and Runs at their top, a list under More (and Settings) right above the More
 * page, so its Back leads to More. Opening the page already shown changes nothing.
 */
export function openPhonePage(
  stacks: PlaceStacks,
  location: TabLocation,
  options: PhoneOpenOptions = {},
): PlaceStacks {
  if (currentPhonePage(stacks).location.key === location.key) {
    return stacks;
  }
  if (isSidebarPlace(location.key)) {
    return openSidebarPlace(stacks, location.key);
  }
  if (location.key === settingsLocation.key) {
    return openMoreList(stacks, settingsLocation);
  }
  const page: PhonePage = { location, list: options.list ?? false };
  return withStack(stacks, stacks.place, [...stacks.stacks[stacks.place], page]);
}

/**
 * Follows a link to a page of another place, such as a waiting run's "Review in Inbox": shows
 * that place where the user left it and opens the page on top, so Back comes back here (phone
 * layout 2). In the place shown it is {@link openPhonePage}.
 */
export function openPhonePageIn(
  stacks: PlaceStacks,
  place: PhonePlace,
  location: TabLocation,
  options: PhoneOpenOptions = {},
): PlaceStacks {
  if (place === stacks.place || isMoreTopLevel(location.key)) {
    return openPhonePage(stacks, location, options);
  }
  const page: PhonePage = { location, list: options.list ?? false, from: stacks.place };
  return { place, stacks: { ...stacks.stacks, [place]: [...stacks.stacks[place], page] } };
}

/**
 * Back, from the top bar or Android's back once the close stack has nothing open (phone layout
 * 2). It goes one page up in the place's stack, or back to the place a link came from. At the top
 * of Inbox, Runs or More it goes to Home; at the top of Home there is nowhere to go, and it
 * returns `undefined`, so the app leaves (in a browser, the browser decides).
 */
export function goBackOnPhone(stacks: PlaceStacks): PlaceStacks | undefined {
  const stack = stacks.stacks[stacks.place];
  if (stack.length > 1) {
    const page = currentPhonePage(stacks);
    const back = withStack(stacks, stacks.place, stack.slice(0, -1));
    return page.from === undefined ? back : { ...back, place: page.from };
  }
  return stacks.place === "home" ? undefined : { ...stacks, place: "home" };
}

function openSidebarPlace(stacks: PlaceStacks, place: SidebarPlace): PlaceStacks {
  const phonePlace = phonePlaceOf(place);
  if (phonePlace === "more") {
    return openMoreList(stacks, { key: place, title: placeNames[place].label });
  }
  return {
    place: phonePlace,
    stacks: { ...stacks.stacks, [phonePlace]: topOf(stacks, phonePlace) },
  };
}

function openMoreList(stacks: PlaceStacks, location: TabLocation): PlaceStacks {
  const pages: readonly PhonePage[] = [...topOf(stacks, "more"), { location, list: true }];
  return { place: "more", stacks: { ...stacks.stacks, more: pages } };
}

function topOf(stacks: PlaceStacks, place: PhonePlace): readonly PhonePage[] {
  return stacks.stacks[place].slice(0, 1);
}

function withStack(
  stacks: PlaceStacks,
  place: PhonePlace,
  pages: readonly PhonePage[],
): PlaceStacks {
  return { ...stacks, stacks: { ...stacks.stacks, [place]: pages } };
}

/** A sidebar place or Settings, which open where they live rather than on the place shown. */
function isMoreTopLevel(key: string): boolean {
  return isSidebarPlace(key) || key === settingsLocation.key;
}
