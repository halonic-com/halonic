import { type RefObject, useRef } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import type { PhonePlaces } from "../phone/use-phone-places.ts";
import { placeNames, type SidebarPlace } from "../points/frame.ts";
import { openLocation } from "../tabs/open-location.ts";
import type { TabLocation, TabSet } from "../tabs/tab-set.ts";

/** What {@link useWindowOpeners} needs from the window. */
export interface WindowOpenersOptions {
  readonly desktop: boolean;
  readonly tabs: TabSet;
  readonly phone: PhonePlaces;
  readonly announcer: Announcer;
  /** Gives focus to the opened page's `h1` on the desktop. */
  readonly focusOpenedPage: () => void;
}

/** How the window opens a place or an item, for the layout it has now. */
export interface WindowOpeners {
  readonly openPlaceHere: RefObject<(place: SidebarPlace) => void>;
  readonly openHere: RefObject<(location: TabLocation) => void>;
  readonly openItemInNewTab: RefObject<(location: TabLocation) => void>;
}

/**
 * The window's openers: in the tabs on the desktop, in the phone's places on a phone. They are
 * refs, read when a view opens something, so a view's context stays the same as the window
 * narrows or widens.
 */
export function useWindowOpeners(options: WindowOpenersOptions): WindowOpeners {
  const { desktop, tabs, phone, announcer, focusOpenedPage } = options;
  const openPlaceHere = useRef<(place: SidebarPlace) => void>(phone.openPlace);
  openPlaceHere.current = desktop
    ? (place) => {
        tabs.openHere({ key: place, title: placeNames[place].label });
        focusOpenedPage();
      }
    : phone.openPlace;
  const openHere = useRef<(location: TabLocation) => void>(phone.open);
  openHere.current = desktop
    ? (location) => {
        tabs.openHere(location);
        focusOpenedPage();
      }
    : (location) => phone.open(location);
  const openItemInNewTab = useRef<(location: TabLocation) => void>(phone.open);
  openItemInNewTab.current = desktop
    ? (location) => openLocation(tabs, announcer, location, true)
    : (location) => phone.open(location);
  return { openPlaceHere, openHere, openItemInNewTab };
}
