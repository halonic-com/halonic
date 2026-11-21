import { useCallback, useRef, useState } from "react";
import { placeNames, type SidebarPlace } from "../points/frame.ts";
import { usePageHeadingFocus } from "../tabs/history-moves.ts";
import type { TabLocation } from "../tabs/tab-set.ts";
import type { BottomNavigationPlace } from "./bottom-navigation.tsx";
import { emptyPageMemory, type PhonePageMemory } from "./page-memory.tsx";
import {
  currentPhonePage,
  goBackOnPhone,
  isAtPlaceTop,
  openPhonePage,
  openPhonePageIn,
  type PhoneOpenOptions,
  type PhonePage,
  type PhonePlace,
  type PlaceStacks,
  retitlePhonePages,
  showPhonePage,
  showsBottomNavigation,
  startPlaceStacks,
  switchPhonePlace,
} from "./place-stacks.ts";

/** The phone's places joined to its bars, as {@link usePhonePlaces} gives them. */
export interface PhonePlaces {
  /** Where the phone is now. */
  readonly stacks: PlaceStacks;
  /** The page shown: the screen draws it (the More page at More's top). */
  readonly page: PhonePage;
  /** What the page shown keeps while pages pushed above it are open; see {@link PhonePageMemory}. */
  readonly memory: PhonePageMemory;
  /** The props for `PhoneTopBar`: the page's title, and Back only under the top of a place. */
  readonly topBar: { readonly title: string; readonly onBack: (() => void) | undefined };
  /** The props for `BottomNavigation`, or `undefined` on an opened item, where it hides. */
  readonly navigation:
    | {
        readonly current: BottomNavigationPlace;
        readonly onSelect: (place: BottomNavigationPlace) => void;
      }
    | undefined;
  /** Opens a page in the place shown, or a sidebar place where it lives (`openPhonePage`). */
  readonly open: (location: TabLocation, options?: PhoneOpenOptions) => void;
  /** Opens a sidebar place, a More page row: its list above the More page. */
  readonly openPlace: (place: SidebarPlace) => void;
  /** Follows a link to another place's page, so Back comes back (`openPhonePageIn`). */
  readonly openIn: (place: PhonePlace, location: TabLocation, options?: PhoneOpenOptions) => void;
  /** Shows the page a desktop tab had open, where it lives on the phone (`showPhonePage`). */
  readonly show: (location: TabLocation, parent?: SidebarPlace) => void;
  /**
   * Back: one page up, or to Home. Returns `false` at the top of Home, where nothing moved, as
   * `usePhoneBackButton` needs.
   */
  readonly back: () => boolean;
  /**
   * Back from the page with this key, when it is the page shown; else nothing moves, as Back has
   * taken the user off it already. For a page that closes itself.
   */
  readonly backFrom: (key: string) => void;
  /**
   * Names the pages again as `titleOf` names their places now (`retitlePhonePages`), after an
   * item is renamed. Focus stays where it is, since nothing moved.
   */
  readonly retitle: (titleOf: (location: TabLocation) => string | undefined) => void;
}

/**
 * Keeps the phone's place stacks and joins them to its bars (phone layout 2, component specs 15):
 * the top bar shows the page's title and Back under a place's top, the bottom navigation shows on
 * places and lists, and every move takes focus to the new page's `h1`, as on the desktop (a11y
 * A3). A move that changes nothing, such as tapping the place shown at its top, leaves focus
 * where it is.
 *
 * Each page in a stack has its own memory while pages above it are open (`PhonePageMemory`), as
 * the page itself is drawn fresh when it shows again.
 *
 * @example
 * const places = usePhonePlaces();
 * usePhoneBackButton(presentation === "phone", shell.closeStack, places);
 * <ShellFrame
 *   phoneTopBar={<PhoneTopBar {...places.topBar} />}
 *   phoneNavigation={places.navigation && <BottomNavigation places={shownPlaces} {...places.navigation} />}
 * >
 *   {places.page.location.key === "more" ? <MorePage onOpen={places.openPlace} … /> : <Page … />}
 * </ShellFrame>
 */
export function usePhonePlaces(): PhonePlaces {
  const [stacks, setStacks] = useState(startPlaceStacks);
  // Back has to say at once whether it moved, so the latest stacks are kept here too.
  const latest = useRef(stacks);
  // Keyed by the page in the stack, so a page opened anew gets a new one and Back finds the old.
  const memories = useRef(new WeakMap<PhonePage, PhonePageMemory>());
  const focusNewPage = usePageHeadingFocus();

  const move = useCallback(
    (next: PlaceStacks) => {
      if (next === latest.current) {
        return;
      }
      latest.current = next;
      setStacks(next);
      focusNewPage();
    },
    [focusNewPage],
  );

  const back = useCallback(() => {
    const next = goBackOnPhone(latest.current);
    if (next === undefined) {
      return false;
    }
    move(next);
    return true;
  }, [move]);

  const backFrom = useCallback(
    (key: string) => {
      if (currentPhonePage(latest.current).location.key === key) {
        back();
      }
    },
    [back],
  );

  const open = useCallback(
    (location: TabLocation, options?: PhoneOpenOptions) =>
      move(openPhonePage(latest.current, location, options)),
    [move],
  );
  const openPlace = useCallback(
    (place: SidebarPlace) => open({ key: place, title: placeNames[place].label }, { list: true }),
    [open],
  );
  const openIn = useCallback(
    (place: PhonePlace, location: TabLocation, options?: PhoneOpenOptions) =>
      move(openPhonePageIn(latest.current, place, location, options)),
    [move],
  );
  const show = useCallback(
    (location: TabLocation, parent?: SidebarPlace) =>
      move(showPhonePage(latest.current, location, parent)),
    [move],
  );
  const onSelect = useCallback(
    (place: BottomNavigationPlace) => move(switchPhonePlace(latest.current, place)),
    [move],
  );

  const retitle = useCallback((titleOf: (location: TabLocation) => string | undefined) => {
    const next = retitlePhonePages(latest.current, titleOf);
    if (next !== latest.current) {
      // A retitled page is a new object in the same place: it keeps the memory of the page it was.
      for (const place of Object.keys(next.stacks) as PhonePlace[]) {
        next.stacks[place].forEach((page, index) => {
          const was = latest.current.stacks[place][index];
          const memory = was === undefined ? undefined : memories.current.get(was);
          if (was !== page && memory !== undefined) {
            memories.current.set(page, memory);
          }
        });
      }
      latest.current = next;
      setStacks(next);
    }
  }, []);

  const page = currentPhonePage(stacks);
  let memory = memories.current.get(page);
  if (memory === undefined) {
    memory = emptyPageMemory();
    memories.current.set(page, memory);
  }
  return {
    stacks,
    page,
    memory,
    topBar: {
      title: page.location.title,
      onBack: isAtPlaceTop(stacks) ? undefined : () => back(),
    },
    navigation: showsBottomNavigation(stacks) ? { current: stacks.place, onSelect } : undefined,
    open,
    openPlace,
    openIn,
    show,
    back,
    backFrom,
    retitle,
  };
}
